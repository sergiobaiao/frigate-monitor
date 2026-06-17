import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HaStorageChecker } from './ha-storage';
import type { ServerContext } from './types';

// Stable mock closure
const mockGetMounts = vi.fn();

vi.mock('@/integrations/ha', () => ({
  HaClient: vi.fn().mockImplementation(() => ({
    getMounts: mockGetMounts,
  })),
  HaError: class HaError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'HaError';
      this.code = code;
    }
  },
}));

function makeCtx(overrides: Partial<ServerContext> = {}): ServerContext {
  return {
    serverId: 'srv-1',
    serverType: 'haos',
    host: '192.168.1.10',
    sshPort: 22,
    haPort: 8123,
    frigatePort: 5000,
    thresholds: {},
    secrets: { haToken: 'test-token' },
    correlationId: 'corr-1',
    ...overrides,
  };
}

describe('HaStorageChecker', () => {
  const checker = new HaStorageChecker();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('all active mounts → ok', async () => {
    mockGetMounts.mockResolvedValue({
      mounts: [
        { name: 'recordings', type: 'nfs', state: 'active' },
        { name: 'backup', type: 'cifs', state: 'active' },
      ],
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('ok');
    expect(result.message).toContain('2 mounts active');
    expect(result.details).toMatchObject({
      totalMounts: 2,
      activeMounts: 2,
      failedMounts: 0,
    });
  });

  it('one failed mount → critical with mount name in message', async () => {
    mockGetMounts.mockResolvedValue({
      mounts: [
        { name: 'recordings', type: 'nfs', state: 'failed' },
        { name: 'backup', type: 'cifs', state: 'active' },
      ],
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('critical');
    expect(result.message).toContain('recordings');
    expect(result.details).toMatchObject({
      failedMounts: 1,
      failedNames: ['recordings'],
    });
  });

  it('one unknown mount → warning', async () => {
    mockGetMounts.mockResolvedValue({
      mounts: [
        { name: 'recordings', type: 'nfs', state: 'unknown' },
        { name: 'backup', type: 'cifs', state: 'active' },
      ],
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('warning');
    expect(result.message).toContain('unknown');
  });

  it('no mounts → ok "No network mounts"', async () => {
    mockGetMounts.mockResolvedValue({ mounts: [] });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('ok');
    expect(result.message).toContain('No network mounts');
    expect(result.details).toMatchObject({ totalMounts: 0 });
  });

  it('no haToken → unknown', async () => {
    const result = await checker.run(makeCtx({ secrets: {} }));

    expect(result.severity).toBe('unknown');
    expect(result.message).toContain('not configured');
    expect(mockGetMounts).not.toHaveBeenCalled();
  });

  it('HaError → unknown', async () => {
    const { HaError } = await import('@/integrations/ha');
    mockGetMounts.mockRejectedValue(
      new HaError('connect ECONNREFUSED', 'NETWORK_ERROR'),
    );

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('unknown');
    expect(result.message).toContain('HA API error');
  });

  it('mixed failed + unknown → critical (failed takes precedence)', async () => {
    mockGetMounts.mockResolvedValue({
      mounts: [
        { name: 'recordings', type: 'nfs', state: 'failed' },
        { name: 'backup', type: 'cifs', state: 'unknown' },
        { name: 'clips', type: 'nfs', state: 'active' },
      ],
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('critical');
    expect(result.message).toContain('recordings');
    expect(result.details).toMatchObject({
      failedMounts: 1,
      failedNames: ['recordings'],
    });
  });
});
