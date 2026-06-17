import { db } from '@/lib/db';
import { redactSecrets } from '@/core/logger/redact';
import type { CheckResult } from '@/domain/checkers/types';
import type { Prisma } from '@/generated/prisma';

export interface SaveCheckRunInput {
  serverId: string;
  result: CheckResult;
  correlationId: string;
  eventId?: string; // reserved for future Event linkage
}

export interface CheckRunSummary {
  id: string;
  checkType: string;
  severity: string;
  message: string;
  durationMs: number;
  checkedAt: Date;
  correlationId: string;
  eventId: string | null;
}

export const CheckRunService = {
  async save(input: SaveCheckRunInput): Promise<{ id: string }> {
    const { serverId, result, correlationId } = input;
    // P2: redact secrets before storing
    const redacted = redactSecrets(result.details ?? {});
    const rawStr = JSON.stringify(redacted).slice(0, 10_000);
    let metrics: Prisma.InputJsonValue;
    try {
      metrics = JSON.parse(rawStr) as Prisma.InputJsonValue;
    } catch {
      metrics = { truncated: true };
    }
    const record = await db.checkRun.create({
      data: {
        serverId,
        type: result.checkType,
        severity: result.severity,
        summary: result.message,
        metrics,
        durationMs: result.durationMs,
        startedAt: result.checkedAt,
        finishedAt: result.checkedAt,
        correlationId,
      },
    });
    return { id: record.id };
  },

  async getRecent(
    serverId: string,
    limit?: number,
  ): Promise<CheckRunSummary[]> {
    const rows = await db.checkRun.findMany({
      where: { serverId },
      orderBy: { startedAt: 'desc' },
      take: limit ?? 50,
      select: {
        id: true,
        type: true,
        severity: true,
        summary: true,
        durationMs: true,
        startedAt: true,
        correlationId: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      checkType: r.type,
      severity: r.severity,
      message: r.summary,
      durationMs: r.durationMs,
      checkedAt: r.startedAt,
      correlationId: r.correlationId,
      eventId: null,
    }));
  },

  async getByCorrelationId(
    correlationId: string,
  ): Promise<CheckRunSummary | null> {
    const r = await db.checkRun.findFirst({
      where: { correlationId },
      select: {
        id: true,
        type: true,
        severity: true,
        summary: true,
        durationMs: true,
        startedAt: true,
        correlationId: true,
      },
    });
    if (!r) return null;
    return {
      id: r.id,
      checkType: r.type,
      severity: r.severity,
      message: r.summary,
      durationMs: r.durationMs,
      checkedAt: r.startedAt,
      correlationId: r.correlationId,
      eventId: null,
    };
  },
};
