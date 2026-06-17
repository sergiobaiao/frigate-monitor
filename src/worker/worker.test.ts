import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock bullmq Worker ---
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const MockWorker = vi
  .fn()
  .mockImplementation((name: string, handler: unknown, opts: unknown) => ({
    name,
    handler,
    opts,
    close: mockWorkerClose,
  }));

vi.mock('bullmq', () => ({ Worker: MockWorker }));

// --- Mock @/lib/db ---
const mockFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  db: { server: { findUnique: mockFindUnique } },
}));

// --- Mock checkerRegistry ---
const mockCheckerGet = vi.fn();
vi.mock('@/domain/checkers/registry', () => ({
  checkerRegistry: { get: mockCheckerGet },
}));

// --- Mock CheckRunService ---
const mockCheckRunSave = vi.fn().mockResolvedValue({ id: 'run-1' });
vi.mock('@/domain/events/check-run-service', () => ({
  CheckRunService: { save: mockCheckRunSave },
}));

// --- Mock EventService ---
const mockProcessCheckResult = vi.fn().mockResolvedValue({ action: 'noop' });
vi.mock('@/domain/events/event-service', () => ({
  EventService: { processCheckResult: mockProcessCheckResult },
}));

// --- Mock SecretService ---
const mockGetSecrets = vi.fn().mockResolvedValue({});
vi.mock('@/domain/servers/secret-service', () => ({
  SecretService: { getSecrets: mockGetSecrets },
}));

// --- Mock logger ---
vi.mock('@/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// --- Mock queues (getRedisConnection) ---
vi.mock('./queues', () => ({
  getRedisConnection: () => ({ host: 'localhost', port: 6379 }),
}));

const { processCheckJob, startWorker } = await import('./worker');

const baseServer = {
  id: 'srv-1',
  type: 'ubuntu',
  host: 'host.example.com',
  sshPort: 22,
  haPort: 8123,
  frigatePort: 5000,
  enabled: true,
  thresholds: {},
  group: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSecrets.mockResolvedValue({});
  mockCheckRunSave.mockResolvedValue({ id: 'run-1' });
  mockProcessCheckResult.mockResolvedValue({ action: 'noop' });
});

describe('processCheckJob', () => {
  it('skips non-existent servers', async () => {
    mockFindUnique.mockResolvedValue(null);
    await processCheckJob({
      data: { serverId: 'missing', correlationId: 'c1' },
    });
    expect(mockGetSecrets).not.toHaveBeenCalled();
    expect(mockCheckerGet).not.toHaveBeenCalled();
  });

  it('skips disabled servers', async () => {
    mockFindUnique.mockResolvedValue({ ...baseServer, enabled: false });
    await processCheckJob({ data: { serverId: 'srv-1', correlationId: 'c1' } });
    expect(mockGetSecrets).not.toHaveBeenCalled();
    expect(mockCheckerGet).not.toHaveBeenCalled();
  });

  it('calls ubuntu checkers for ubuntu server type', async () => {
    mockFindUnique.mockResolvedValue({ ...baseServer, type: 'ubuntu' });
    const mockRun = vi.fn().mockResolvedValue({
      checkType: 'connectivity',
      severity: 'ok',
      message: 'ok',
      durationMs: 10,
      checkedAt: new Date(),
    });
    mockCheckerGet.mockReturnValue({ checkType: 'connectivity', run: mockRun });

    await processCheckJob({ data: { serverId: 'srv-1', correlationId: 'c1' } });

    // Ubuntu: connectivity, frigate_ubuntu, disk (3 checkers)
    expect(mockCheckerGet).toHaveBeenCalledTimes(3);
    expect(mockCheckerGet).toHaveBeenCalledWith('connectivity');
    expect(mockCheckerGet).toHaveBeenCalledWith('frigate_ubuntu');
    expect(mockCheckerGet).toHaveBeenCalledWith('disk');
  });

  it('calls haos checkers for haos server type', async () => {
    mockFindUnique.mockResolvedValue({ ...baseServer, type: 'haos' });
    const mockRun = vi.fn().mockResolvedValue({
      checkType: 'connectivity',
      severity: 'ok',
      message: 'ok',
      durationMs: 10,
      checkedAt: new Date(),
    });
    mockCheckerGet.mockReturnValue({ checkType: 'connectivity', run: mockRun });

    await processCheckJob({ data: { serverId: 'srv-1', correlationId: 'c1' } });

    // HAOS: connectivity, frigate_haos, ha_storage, frigate_recordings, camera_image (5 checkers)
    expect(mockCheckerGet).toHaveBeenCalledTimes(5);
    expect(mockCheckerGet).toHaveBeenCalledWith('connectivity');
    expect(mockCheckerGet).toHaveBeenCalledWith('frigate_haos');
    expect(mockCheckerGet).toHaveBeenCalledWith('ha_storage');
    expect(mockCheckerGet).toHaveBeenCalledWith('frigate_recordings');
    expect(mockCheckerGet).toHaveBeenCalledWith('camera_image');
  });

  it('saves check run and processes event for each checker result', async () => {
    mockFindUnique.mockResolvedValue({ ...baseServer, type: 'ubuntu' });
    mockCheckerGet.mockImplementation((type: string) => ({
      checkType: type,
      run: vi.fn().mockResolvedValue({
        checkType: type,
        severity: 'ok',
        message: 'ok',
        durationMs: 5,
        checkedAt: new Date(),
      }),
    }));

    await processCheckJob({ data: { serverId: 'srv-1', correlationId: 'c1' } });

    // 3 ubuntu checkers → 3 saves + 3 event process calls
    expect(mockCheckRunSave).toHaveBeenCalledTimes(3);
    expect(mockProcessCheckResult).toHaveBeenCalledTimes(3);
    expect(mockCheckRunSave).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 'srv-1', correlationId: 'c1' }),
    );
  });

  it('catches per-checker error without crashing other checkers (P5 isolation)', async () => {
    mockFindUnique.mockResolvedValue({ ...baseServer, type: 'ubuntu' });
    mockCheckerGet.mockImplementation((type: string) => ({
      checkType: type,
      run:
        type === 'connectivity'
          ? vi.fn().mockRejectedValue(new Error('network failure'))
          : vi.fn().mockResolvedValue({
              checkType: type,
              severity: 'ok',
              message: 'ok',
              durationMs: 5,
              checkedAt: new Date(),
            }),
    }));

    // Should not throw
    await expect(
      processCheckJob({ data: { serverId: 'srv-1', correlationId: 'c1' } }),
    ).resolves.toBeUndefined();

    // connectivity failed → only 2 saves (frigate_ubuntu + disk)
    expect(mockCheckRunSave).toHaveBeenCalledTimes(2);
  });
});

describe('startWorker', () => {
  it('creates Worker with correct queue name and returns stop function', async () => {
    const { worker, stop } = startWorker();

    expect(MockWorker).toHaveBeenCalledWith(
      'check',
      expect.any(Function),
      expect.objectContaining({ concurrency: 5 }),
    );
    expect(worker).toBeDefined();
    expect(typeof stop).toBe('function');

    await stop();
    expect(mockWorkerClose).toHaveBeenCalledOnce();
  });
});
