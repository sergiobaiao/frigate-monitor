import { db } from '@/lib/db';
import type { Severity } from '@/generated/prisma';

export interface EventInput {
  serverId: string;
  checkType: string;
  severity: Severity;
}

export type ProcessResult =
  | { action: 'opened'; eventId: string }
  | { action: 'updated'; eventId: string }
  | { action: 'resolved'; eventId: string }
  | { action: 'noop' };

export const EventService = {
  async processCheckResult(input: EventInput): Promise<ProcessResult> {
    const { serverId, checkType, severity } = input;
    const dedupeKey = `${serverId}:${checkType}`;

    const existing = await db.event.findFirst({
      where: { serverId, checkType, status: 'open' },
    });

    if (severity === 'ok') {
      if (!existing) return { action: 'noop' };
      await db.event.update({
        where: { id: existing.id },
        data: { status: 'resolved', resolvedAt: new Date() },
      });
      return { action: 'resolved', eventId: existing.id };
    }

    // severity !== 'ok'
    if (!existing) {
      const created = await db.event.create({
        data: {
          serverId,
          checkType,
          dedupeKey,
          status: 'open',
          severity,
        },
      });
      return { action: 'opened', eventId: created.id };
    }

    const updated = await db.event.update({
      where: { id: existing.id },
      data: {
        severity,
        lastSeenAt: new Date(),
      },
    });
    return { action: 'updated', eventId: updated.id };
  },

  async getOpenEvent(
    serverId: string,
    checkType: string,
  ): Promise<{ id: string; severity: Severity; lastSeenAt: Date } | null> {
    const event = await db.event.findFirst({
      where: { serverId, checkType, status: 'open' },
      select: { id: true, severity: true, lastSeenAt: true },
    });
    return event ?? null;
  },

  async resolveAll(serverId: string): Promise<number> {
    const result = await db.event.updateMany({
      where: { serverId, status: 'open' },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    return result.count;
  },
};
