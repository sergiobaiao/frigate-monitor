import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — use vi.hoisted to declare the spy before the factory runs
const { mockAuditLogCreate } = vi.hoisted(() => ({
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    auditLog: {
      create: mockAuditLogCreate,
    },
  },
}));

// Mock logger to avoid pino/env issues in tests
vi.mock('@/core/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/logger')>();
  return {
    ...actual,
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
});

import { withAudit } from '@/lib/audit';

const baseOpts = {
  action: 'server.create',
  entity: 'Server',
  entityId: 'srv-123',
};

const baseCtx = { actorId: 'user-1', ip: '127.0.0.1' };

beforeEach(() => {
  mockAuditLogCreate.mockReset();
  mockAuditLogCreate.mockResolvedValue({});
});

describe('withAudit', () => {
  it('calls db.auditLog.create with correct fields on success', async () => {
    await withAudit(baseOpts, baseCtx, async () => 'result');

    expect(mockAuditLogCreate).toHaveBeenCalledOnce();
    const data = mockAuditLogCreate.mock.calls[0][0].data;
    expect(data.action).toBe('server.create');
    expect(data.entity).toBe('Server');
    expect(data.entityId).toBe('srv-123');
    expect(data.actorId).toBe('user-1');
  });

  it('redacts secret fields in before', async () => {
    await withAudit(
      { ...baseOpts, before: { token: 'super-secret', name: 'test' } },
      baseCtx,
      async () => 'ok',
    );

    const data = mockAuditLogCreate.mock.calls[0][0].data;
    expect(data.before).toEqual({ token: '[REDACTED]', name: 'test' });
  });

  it('does NOT call db.auditLog.create when fn() throws', async () => {
    await expect(
      withAudit(baseOpts, baseCtx, async () => {
        throw new Error('fn failed');
      }),
    ).rejects.toThrow('fn failed');

    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('does NOT throw when db.auditLog.create throws (swallows audit error)', async () => {
    mockAuditLogCreate.mockRejectedValue(new Error('db down'));

    await expect(withAudit(baseOpts, baseCtx, async () => 'ok')).resolves.toBe(
      'ok',
    );
  });

  it('resolves entityId from fn result when entityId is a function', async () => {
    const entityIdFn = (result: unknown) => (result as { id: string }).id;

    await withAudit(
      { ...baseOpts, entityId: entityIdFn },
      baseCtx,
      async () => ({ id: 'dynamic-id' }),
    );

    const data = mockAuditLogCreate.mock.calls[0][0].data;
    expect(data.entityId).toBe('dynamic-id');
  });
});
