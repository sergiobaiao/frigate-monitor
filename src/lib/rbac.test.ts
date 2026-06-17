import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock before importing rbac so the module sees the mock
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

import { requireRole } from '@/lib/rbac';
import { auth } from '@/lib/auth';

const mockAuth = vi.mocked(auth);

function makeSession(role: string) {
  return { user: { id: 'user-1', email: 'test@example.com', role } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireRole', () => {
  it('resolves with user info when admin calls requireRole("admin")', async () => {
    mockAuth.mockResolvedValue(makeSession('admin') as never);
    const result = await requireRole('admin');
    expect(result).toEqual({ id: 'user-1', role: 'admin' });
  });

  it('throws when operator calls requireRole("admin")', async () => {
    mockAuth.mockResolvedValue(makeSession('operator') as never);
    await expect(requireRole('admin')).rejects.toThrow('Forbidden');
  });

  it('resolves when operator calls requireRole("operator")', async () => {
    mockAuth.mockResolvedValue(makeSession('operator') as never);
    const result = await requireRole('operator');
    expect(result).toEqual({ id: 'user-1', role: 'operator' });
  });

  it('throws when no session exists', async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(requireRole('viewer')).rejects.toThrow('Unauthorized');
  });

  it('enforces role hierarchy: viewer < operator < admin', async () => {
    // viewer cannot access operator route
    mockAuth.mockResolvedValue(makeSession('viewer') as never);
    await expect(requireRole('operator')).rejects.toThrow('Forbidden');

    // viewer cannot access admin route
    mockAuth.mockResolvedValue(makeSession('viewer') as never);
    await expect(requireRole('admin')).rejects.toThrow('Forbidden');

    // operator cannot access admin route
    mockAuth.mockResolvedValue(makeSession('operator') as never);
    await expect(requireRole('admin')).rejects.toThrow('Forbidden');

    // operator can access viewer route
    mockAuth.mockResolvedValue(makeSession('operator') as never);
    await expect(requireRole('viewer')).resolves.toEqual({
      id: 'user-1',
      role: 'operator',
    });

    // admin can access viewer and operator routes
    mockAuth.mockResolvedValue(makeSession('admin') as never);
    await expect(requireRole('viewer')).resolves.toEqual({
      id: 'user-1',
      role: 'admin',
    });

    mockAuth.mockResolvedValue(makeSession('admin') as never);
    await expect(requireRole('operator')).resolves.toEqual({
      id: 'user-1',
      role: 'admin',
    });
  });
});
