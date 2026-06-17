'use server';

import { db } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { withAudit } from '@/lib/audit';
import {
  ServerGroupCreateSchema,
  ServerGroupUpdateSchema,
} from '@/features/servers/schemas';

export async function createGroup(
  data: unknown,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const actor = await requireRole('operator');
    const parsed = ServerGroupCreateSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? 'Invalid data',
      };
    }

    const group = await withAudit(
      {
        action: 'group.create',
        entity: 'ServerGroup',
        entityId: (result: unknown) => (result as { id: string }).id,
        after: (result: unknown) => result,
      },
      { actorId: actor.id },
      () => db.serverGroup.create({ data: { name: parsed.data.name } }),
    );

    return { success: true, id: group.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

export async function updateGroup(
  data: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const actor = await requireRole('operator');
    const parsed = ServerGroupUpdateSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? 'Invalid data',
      };
    }

    const before = await db.serverGroup.findUnique({
      where: { id: parsed.data.id },
    });

    await withAudit(
      {
        action: 'group.update',
        entity: 'ServerGroup',
        entityId: parsed.data.id,
        before,
        after: { name: parsed.data.name },
      },
      { actorId: actor.id },
      () =>
        db.serverGroup.update({
          where: { id: parsed.data.id },
          data: { name: parsed.data.name },
        }),
    );

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

export async function deleteGroup(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const actor = await requireRole('admin');

    const group = await db.serverGroup.findUnique({
      where: { id },
      include: { _count: { select: { servers: true } } },
    });

    if (!group) {
      return { success: false, error: 'Group not found' };
    }

    if (group._count.servers > 0) {
      return { success: false, error: 'Group has servers' };
    }

    await withAudit(
      {
        action: 'group.delete',
        entity: 'ServerGroup',
        entityId: id,
        before: { name: group.name },
      },
      { actorId: actor.id },
      () => db.serverGroup.delete({ where: { id } }),
    );

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

export async function getGroups(): Promise<
  Array<{ id: string; name: string; serverCount: number; createdAt: Date }>
> {
  await requireRole('viewer');

  const groups = await db.serverGroup.findMany({
    include: { _count: { select: { servers: true } } },
    orderBy: { name: 'asc' },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    serverCount: g._count.servers,
    createdAt: g.createdAt,
  }));
}
