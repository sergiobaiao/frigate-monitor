import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, redactMock } = vi.hoisted(() => ({
  dbMock: {} as {
    checkRun: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  },
  redactMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/core/logger/redact', () => ({ redactSecrets: redactMock }));

import { CheckRunService } from './check-run-service';
import type { CheckResult } from '@/domain/checkers/types';

function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    checkType: 'disk',
    severity: 'ok',
    message: 'Disk OK',
    details: { usedPct: 42 },
    durationMs: 100,
    checkedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  dbMock.checkRun = {
    create: vi.fn().mockResolvedValue({ id: 'run-1' }),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  redactMock.mockImplementation((x: unknown) => x);
});

describe('CheckRunService.save', () => {
  it('calls redactSecrets on result.details (P2 compliance)', async () => {
    const result = makeResult({ details: { usedPct: 55 } });
    await CheckRunService.save({ serverId: 's1', result, correlationId: 'c1' });
    expect(redactMock).toHaveBeenCalledWith({ usedPct: 55 });
  });

  it('falls back to empty object when details is undefined', async () => {
    const result = makeResult({ details: undefined });
    await CheckRunService.save({ serverId: 's1', result, correlationId: 'c1' });
    expect(redactMock).toHaveBeenCalledWith({});
  });

  it('stores truncated sentinel when details JSON exceeds 10_000 chars', async () => {
    const bigValue = 'x'.repeat(20_000);
    redactMock.mockReturnValue({ data: bigValue });
    const result = makeResult({ details: { data: bigValue } });
    await CheckRunService.save({ serverId: 's1', result, correlationId: 'c1' });
    const passedMetrics = dbMock.checkRun.create.mock.calls[0][0].data.metrics;
    // JSON string of 20k value is >10k chars → gets sliced → invalid JSON → { truncated: true }
    expect(passedMetrics).toEqual({ truncated: true });
  });

  it('passes correlationId to db.create', async () => {
    const result = makeResult();
    await CheckRunService.save({
      serverId: 's1',
      result,
      correlationId: 'c42',
    });
    expect(dbMock.checkRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ correlationId: 'c42' }),
      }),
    );
  });

  it('maps result fields to DB column names correctly', async () => {
    const checkedAt = new Date('2026-06-01T12:00:00Z');
    const result = makeResult({
      checkType: 'connectivity',
      message: 'All good',
      checkedAt,
    });
    await CheckRunService.save({
      serverId: 'srv-2',
      result,
      correlationId: 'c1',
    });
    expect(dbMock.checkRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'connectivity',
          summary: 'All good',
          startedAt: checkedAt,
          finishedAt: checkedAt,
          serverId: 'srv-2',
        }),
      }),
    );
  });

  it('returns { id } from db.create', async () => {
    dbMock.checkRun.create.mockResolvedValue({ id: 'run-xyz' });
    const result = makeResult();
    const out = await CheckRunService.save({
      serverId: 's1',
      result,
      correlationId: 'c1',
    });
    expect(out).toEqual({ id: 'run-xyz' });
  });

  it('calls redactSecrets even when details has secret key patterns', async () => {
    const details = { password: 'super-secret', apiKey: 'abc123', usedPct: 10 };
    const result = makeResult({ details });
    await CheckRunService.save({ serverId: 's1', result, correlationId: 'c1' });
    expect(redactMock).toHaveBeenCalledWith(details);
  });
});

describe('CheckRunService.getRecent', () => {
  it('calls findMany with correct serverId, orderBy desc, and default take=50', async () => {
    await CheckRunService.getRecent('srv-1');
    expect(dbMock.checkRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serverId: 'srv-1' },
        orderBy: { startedAt: 'desc' },
        take: 50,
      }),
    );
  });

  it('respects custom limit', async () => {
    await CheckRunService.getRecent('srv-1', 10);
    expect(dbMock.checkRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it('returns empty array when no runs exist', async () => {
    dbMock.checkRun.findMany.mockResolvedValue([]);
    const result = await CheckRunService.getRecent('srv-1');
    expect(result).toEqual([]);
  });

  it('maps DB rows to CheckRunSummary shape', async () => {
    const startedAt = new Date('2026-01-01T00:00:00Z');
    dbMock.checkRun.findMany.mockResolvedValue([
      {
        id: 'run-1',
        type: 'disk',
        severity: 'ok',
        summary: 'Disk OK',
        durationMs: 50,
        startedAt,
        correlationId: 'corr-1',
      },
    ]);
    const rows = await CheckRunService.getRecent('srv-1');
    expect(rows).toEqual([
      {
        id: 'run-1',
        checkType: 'disk',
        severity: 'ok',
        message: 'Disk OK',
        durationMs: 50,
        checkedAt: startedAt,
        correlationId: 'corr-1',
        eventId: null,
      },
    ]);
  });
});

describe('CheckRunService.getByCorrelationId', () => {
  it('returns null when not found', async () => {
    dbMock.checkRun.findFirst.mockResolvedValue(null);
    const result = await CheckRunService.getByCorrelationId('no-such-id');
    expect(result).toBeNull();
  });

  it('queries by correlationId', async () => {
    await CheckRunService.getByCorrelationId('corr-abc');
    expect(dbMock.checkRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { correlationId: 'corr-abc' } }),
    );
  });

  it('maps found DB row to CheckRunSummary', async () => {
    const startedAt = new Date('2026-03-01T00:00:00Z');
    dbMock.checkRun.findFirst.mockResolvedValue({
      id: 'run-42',
      type: 'frigate_status',
      severity: 'warning',
      summary: 'Low FPS',
      durationMs: 200,
      startedAt,
      correlationId: 'corr-abc',
    });
    const result = await CheckRunService.getByCorrelationId('corr-abc');
    expect(result).toEqual({
      id: 'run-42',
      checkType: 'frigate_status',
      severity: 'warning',
      message: 'Low FPS',
      durationMs: 200,
      checkedAt: startedAt,
      correlationId: 'corr-abc',
      eventId: null,
    });
  });
});
