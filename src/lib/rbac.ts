import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export type UserRole = 'admin' | 'operator' | 'viewer';

const ROLE_RANK: Record<UserRole, number> = {
  admin: 3,
  operator: 2,
  viewer: 1,
};

/**
 * Use in Server Actions. Throws if no session or role is below minRole.
 */
export async function requireRole(
  minRole: UserRole,
): Promise<{ id: string; role: UserRole }> {
  const session = await auth();

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const role = session.user.role as UserRole;
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new Error('Forbidden');
  }

  return { id: session.user.id, role };
}

/**
 * Use in Route Handlers. Returns 401/403 Response on failure, null on success.
 */
export function guardRoute(
  minRole: UserRole,
): (req: Request) => Promise<Response | null> {
  return async (_req: Request) => {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = session.user.role as UserRole;
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return null;
  };
}
