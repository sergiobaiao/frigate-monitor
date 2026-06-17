import { db } from '@/lib/db';
import { logger, redactSecrets } from '@/core/logger';

export interface AuditContext {
  actorId?: string;
  ip?: string;
}

export interface AuditOptions {
  action: string;
  entity: string;
  entityId: string | ((result: unknown) => string);
  before?: unknown;
  after?: unknown | ((result: unknown) => unknown);
}

export async function writeAudit(entry: {
  actorId?: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before:
          entry.before !== undefined
            ? (redactSecrets(entry.before) as object)
            : undefined,
        after:
          entry.after !== undefined
            ? (redactSecrets(entry.after) as object)
            : undefined,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, entry }, 'audit write failed');
  }
}

export async function withAudit<T>(
  opts: AuditOptions,
  ctx: AuditContext,
  fn: () => Promise<T>,
): Promise<T> {
  const result = await fn();

  const entityId =
    typeof opts.entityId === 'function' ? opts.entityId(result) : opts.entityId;

  const after =
    typeof opts.after === 'function' ? opts.after(result) : opts.after;

  await writeAudit({
    actorId: ctx.actorId,
    action: opts.action,
    entity: opts.entity,
    entityId,
    before: opts.before,
    after,
    ip: ctx.ip,
  });

  return result;
}
