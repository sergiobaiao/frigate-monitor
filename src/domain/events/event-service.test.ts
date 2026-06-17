import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — declare mocks via vi.hoisted so they're available in the factory
const { mockFindFirst, mockCreate, mockUpdate, mockUpdateMany } = vi.hoisted(
  () => ({
    mockFindFirst: vi.fn(),
    mockCreate: vi.fn().mockResolvedValue({ id: 'evt-1' }),
    mockUpdate: vi.fn().mockResolvedValue({ id: 'evt-1' }),
    mockUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  }),
);

vi.mock('@/lib/db', () => ({
  db: {
    event: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
  },
}));

import { EventService } from './event-service';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'evt-1' });
  mockUpdate.mockResolvedValue({ id: 'evt-1' });
  mockUpdateMany.mockResolvedValue({ count: 1 });
});

describe('EventService.processCheckResult', () => {
  it('severity critical + no open event → action=opened, creates event', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await EventService.processCheckResult({
      serverId: 'srv-1',
      checkType: 'cpu',
      severity: 'critical',
    });

    expect(result.action).toBe('opened');
    expect('eventId' in result && result.eventId).toBe('evt-1');
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serverId: 'srv-1',
        checkType: 'cpu',
        dedupeKey: 'srv-1:cpu',
        status: 'open',
        severity: 'critical',
      }),
    });
  });

  it('severity warning + existing open event → action=updated, updates lastSeenAt', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'evt-1',
      severity: 'warning',
      lastSeenAt: new Date('2024-01-01'),
    });

    const result = await EventService.processCheckResult({
      serverId: 'srv-1',
      checkType: 'cpu',
      severity: 'warning',
    });

    expect(result.action).toBe('updated');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
    });
  });

  it('severity ok + open event → action=resolved, resolves event', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'evt-1',
      severity: 'warning',
      lastSeenAt: new Date(),
    });

    const result = await EventService.processCheckResult({
      serverId: 'srv-1',
      checkType: 'cpu',
      severity: 'ok',
    });

    expect(result.action).toBe('resolved');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: expect.objectContaining({
        status: 'resolved',
        resolvedAt: expect.any(Date),
      }),
    });
  });

  it('severity ok + no open event → action=noop, no DB write', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await EventService.processCheckResult({
      serverId: 'srv-1',
      checkType: 'cpu',
      severity: 'ok',
    });

    expect(result.action).toBe('noop');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('severity changes warning→critical on update → updates severity in DB', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'evt-1',
      severity: 'warning',
      lastSeenAt: new Date(),
    });

    const result = await EventService.processCheckResult({
      serverId: 'srv-1',
      checkType: 'cpu',
      severity: 'critical',
    });

    expect(result.action).toBe('updated');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: expect.objectContaining({ severity: 'critical' }),
    });
  });
});

describe('EventService.getOpenEvent', () => {
  it('returns null when no open event exists', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await EventService.getOpenEvent('srv-1', 'cpu');

    expect(result).toBeNull();
  });

  it('returns event when open event exists', async () => {
    const mockEvent = {
      id: 'evt-1',
      severity: 'warning' as const,
      lastSeenAt: new Date(),
    };
    mockFindFirst.mockResolvedValue(mockEvent);

    const result = await EventService.getOpenEvent('srv-1', 'cpu');

    expect(result).toEqual(mockEvent);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { serverId: 'srv-1', checkType: 'cpu', status: 'open' },
      select: { id: true, severity: true, lastSeenAt: true },
    });
  });
});

describe('EventService.resolveAll', () => {
  it('calls updateMany with correct filter and returns count', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });

    const count = await EventService.resolveAll('srv-1');

    expect(count).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { serverId: 'srv-1', status: 'open' },
      data: expect.objectContaining({
        status: 'resolved',
        resolvedAt: expect.any(Date),
      }),
    });
  });
});
