// SchedulerService — manages repeatable check jobs per server
// T071: add/remove jobs based on server.enabled
// T072: per-server deduplication via stable jobId (BullMQ handles lock)
// T073: isolation — syncAllServers catches errors per-server, logs, continues

import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { logger } from '@/core/logger';
import { getCheckQueue } from './queues';

export const SchedulerService = {
  async scheduleServer(serverId: string): Promise<void> {
    const server = await db.server.findUnique({
      where: { id: serverId },
      select: { id: true, enabled: true, intervalSec: true },
    });

    if (!server) {
      logger.warn({ serverId }, 'scheduleServer: server not found');
      return;
    }

    if (!server.enabled) {
      await SchedulerService.unscheduleServer(serverId);
      return;
    }

    // Remove existing first (idempotent update)
    await SchedulerService.unscheduleServer(serverId);

    const queue = getCheckQueue();
    await queue.add(
      'check',
      { serverId, correlationId: randomUUID() },
      {
        repeat: { every: server.intervalSec * 1000 },
        jobId: `check:${serverId}`,
      },
    );
  },

  async unscheduleServer(serverId: string): Promise<void> {
    const queue = getCheckQueue();
    const repeatableJobs = await queue.getRepeatableJobs();
    const matches = repeatableJobs.filter(
      (j: { id?: string | null; key: string }) =>
        j.id === `check:${serverId}` || j.key.includes(serverId),
    );
    for (const job of matches) {
      await queue.removeRepeatableByKey(job.key);
    }
  },

  async syncAllServers(): Promise<{
    scheduled: number;
    unscheduled: number;
    errors: number;
  }> {
    const servers = await db.server.findMany({
      select: { id: true, enabled: true },
    });

    let scheduled = 0;
    let unscheduled = 0;
    let errors = 0;

    for (const server of servers) {
      try {
        await SchedulerService.scheduleServer(server.id);
        if (server.enabled) {
          scheduled++;
        } else {
          unscheduled++;
        }
      } catch (err) {
        logger.error(
          { serverId: server.id, err },
          'syncAllServers: failed to schedule server',
        );
        errors++;
      }
    }

    return { scheduled, unscheduled, errors };
  },
};
