import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Queue mock (stable closure) ---
const queueMock = {
  add: vi.fn(),
  getRepeatableJobs: vi.fn(),
  removeRepeatableByKey: vi.fn(),
};

vi.mock('./queues', () => ({
  getCheckQueue: () => queueMock,
}));

// --- DB mock ---
vi.mock('@/lib/db', () => ({
  db: {
    server: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// --- Logger mock ---
vi.mock('@/core/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { SchedulerService } from './scheduler';
import { db } from '@/lib/db';
import { logger } from '@/core/logger';

const dbMock = db as unknown as {
  server: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  queueMock.getRepeatableJobs.mockResolvedValue([]);
  queueMock.add.mockResolvedValue(undefined);
  queueMock.removeRepeatableByKey.mockResolvedValue(undefined);
});

// ─── scheduleServer ───────────────────────────────────────────────────────────

describe('scheduleServer', () => {
  it('adds repeatable job for enabled server', async () => {
    dbMock.server.findUnique.mockResolvedValue({
      id: 'srv-1',
      enabled: true,
      intervalSec: 60,
    });

    await SchedulerService.scheduleServer('srv-1');

    expect(queueMock.add).toHaveBeenCalledOnce();
    expect(queueMock.add).toHaveBeenCalledWith(
      'check',
      expect.objectContaining({ serverId: 'srv-1' }),
      expect.objectContaining({
        repeat: { every: 60_000 },
        jobId: 'check:srv-1',
      }),
    );
  });

  it('uses intervalSec from server config to compute repeat.every', async () => {
    dbMock.server.findUnique.mockResolvedValue({
      id: 'srv-2',
      enabled: true,
      intervalSec: 300,
    });

    await SchedulerService.scheduleServer('srv-2');

    const callArgs = queueMock.add.mock.calls[0];
    expect(callArgs[2].repeat.every).toBe(300_000);
  });

  it('disabled server → removes existing job, does NOT add', async () => {
    dbMock.server.findUnique.mockResolvedValue({
      id: 'srv-3',
      enabled: false,
      intervalSec: 60,
    });
    queueMock.getRepeatableJobs.mockResolvedValue([
      { id: 'check:srv-3', key: 'check:srv-3::60000' },
    ]);

    await SchedulerService.scheduleServer('srv-3');

    expect(queueMock.removeRepeatableByKey).toHaveBeenCalledWith(
      'check:srv-3::60000',
    );
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it('nonexistent server → logs warn, returns without scheduling', async () => {
    dbMock.server.findUnique.mockResolvedValue(null);

    await SchedulerService.scheduleServer('no-such-id');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 'no-such-id' }),
      expect.any(String),
    );
    expect(queueMock.add).not.toHaveBeenCalled();
  });
});

// ─── unscheduleServer ─────────────────────────────────────────────────────────

describe('unscheduleServer', () => {
  it('removes matching repeatable job by key', async () => {
    queueMock.getRepeatableJobs.mockResolvedValue([
      { id: 'check:srv-4', key: 'check:srv-4::30000' },
      { id: 'check:other', key: 'check:other::30000' },
    ]);

    await SchedulerService.unscheduleServer('srv-4');

    expect(queueMock.removeRepeatableByKey).toHaveBeenCalledOnce();
    expect(queueMock.removeRepeatableByKey).toHaveBeenCalledWith(
      'check:srv-4::30000',
    );
  });

  it('does nothing when no matching job exists', async () => {
    queueMock.getRepeatableJobs.mockResolvedValue([
      { id: 'check:other', key: 'check:other::30000' },
    ]);

    await SchedulerService.unscheduleServer('srv-ghost');

    expect(queueMock.removeRepeatableByKey).not.toHaveBeenCalled();
  });
});

// ─── syncAllServers ───────────────────────────────────────────────────────────

describe('syncAllServers', () => {
  it('schedules all enabled servers', async () => {
    dbMock.server.findMany.mockResolvedValue([
      { id: 'srv-a', enabled: true },
      { id: 'srv-b', enabled: true },
    ]);
    dbMock.server.findUnique
      .mockResolvedValueOnce({ id: 'srv-a', enabled: true, intervalSec: 60 })
      .mockResolvedValueOnce({ id: 'srv-b', enabled: true, intervalSec: 120 });

    const result = await SchedulerService.syncAllServers();

    expect(queueMock.add).toHaveBeenCalledTimes(2);
    expect(result.scheduled).toBe(2);
    expect(result.unscheduled).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('returns correct counts for mixed enabled/disabled servers', async () => {
    dbMock.server.findMany.mockResolvedValue([
      { id: 'srv-e', enabled: true },
      { id: 'srv-d', enabled: false },
    ]);
    dbMock.server.findUnique
      .mockResolvedValueOnce({ id: 'srv-e', enabled: true, intervalSec: 60 })
      .mockResolvedValueOnce({ id: 'srv-d', enabled: false, intervalSec: 60 });

    const result = await SchedulerService.syncAllServers();

    expect(result.scheduled).toBe(1);
    expect(result.unscheduled).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('catches error for one server, continues others (T073 isolation)', async () => {
    dbMock.server.findMany.mockResolvedValue([
      { id: 'srv-ok', enabled: true },
      { id: 'srv-fail', enabled: true },
    ]);
    dbMock.server.findUnique
      .mockResolvedValueOnce({ id: 'srv-ok', enabled: true, intervalSec: 60 })
      .mockRejectedValueOnce(new Error('DB connection lost'));

    const result = await SchedulerService.syncAllServers();

    expect(result.scheduled).toBe(1);
    expect(result.errors).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 'srv-fail' }),
      expect.any(String),
    );
    // srv-ok still got scheduled
    expect(queueMock.add).toHaveBeenCalledOnce();
  });
});
