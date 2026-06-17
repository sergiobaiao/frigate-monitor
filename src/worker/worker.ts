// Standalone worker process — not imported by Next.js app
// Reads from 'check' queue → runs all enabled checkers for server → stores results
// Heartbeat: logs a heartbeat every HEARTBEAT_INTERVAL_MS (default 30s)

import { Worker } from 'bullmq';
import { db } from '@/lib/db';
import { logger } from '@/core/logger';
import { checkerRegistry } from '@/domain/checkers/registry';
import { CheckRunService } from '@/domain/events/check-run-service';
import { EventService } from '@/domain/events/event-service';
import { SecretService } from '@/domain/servers/secret-service';
import type { ServerContext } from '@/domain/checkers/types';
import type { CheckJobData } from './queues';
import { getRedisConnection } from './queues';

const HEARTBEAT_INTERVAL_MS = Number(
  process.env.HEARTBEAT_INTERVAL_MS ?? 30_000,
);

// Checker types per server kind
const UBUNTU_CHECKERS = ['connectivity', 'frigate_ubuntu', 'disk'];
const HAOS_CHECKERS = [
  'connectivity',
  'frigate_haos',
  'ha_storage',
  'frigate_recordings',
  'camera_image',
];

export async function processCheckJob(job: {
  data: CheckJobData;
}): Promise<void> {
  const { serverId, correlationId } = job.data;

  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { group: true },
  });

  if (!server) {
    logger.warn({ serverId }, 'processCheckJob: server not found, skipping');
    return;
  }

  if (!server.enabled) {
    logger.warn({ serverId }, 'processCheckJob: server disabled, skipping');
    return;
  }

  const secrets = await SecretService.getSecrets(serverId);

  const thresholds = (server.thresholds ?? {}) as Record<string, unknown>;
  const ctx: ServerContext = {
    serverId: server.id,
    serverType: server.type as 'ubuntu' | 'haos',
    host: server.host,
    sshPort: server.sshPort ?? 22,
    haPort: server.haPort ?? 8123,
    frigatePort: server.frigatePort ?? 5000,
    thresholds: {
      warnPct:
        typeof thresholds['warnPct'] === 'number'
          ? thresholds['warnPct']
          : undefined,
      critPct:
        typeof thresholds['critPct'] === 'number'
          ? thresholds['critPct']
          : undefined,
      minFreePct:
        typeof thresholds['minFreePct'] === 'number'
          ? thresholds['minFreePct']
          : undefined,
      emergencyPct:
        typeof thresholds['emergencyPct'] === 'number'
          ? thresholds['emergencyPct']
          : undefined,
      staleFrameIntervals:
        typeof thresholds['staleFrameIntervals'] === 'number'
          ? thresholds['staleFrameIntervals']
          : undefined,
      minRetentionDays:
        typeof thresholds['minRetentionDays'] === 'number'
          ? thresholds['minRetentionDays']
          : undefined,
    },
    secrets,
    correlationId,
  };

  const checkerTypes = server.type === 'haos' ? HAOS_CHECKERS : UBUNTU_CHECKERS;

  for (const checkType of checkerTypes) {
    let checker;
    try {
      checker = checkerRegistry.get(checkType);
    } catch {
      // Checker not registered — skip silently (P5 isolation)
      logger.warn(
        { checkType, serverId },
        'processCheckJob: checker not registered',
      );
      continue;
    }

    try {
      const result = await checker.run(ctx);
      await CheckRunService.save({ serverId, result, correlationId });
      await EventService.processCheckResult({
        serverId,
        checkType: result.checkType,
        severity: result.severity,
      });
    } catch (err) {
      // P5: isolate per-checker failures — other checkers still run
      logger.error(
        { err, checkType, serverId },
        'processCheckJob: checker error',
      );
    }
  }
}

export function startWorker(): { worker: Worker; stop: () => Promise<void> } {
  const worker = new Worker('check', processCheckJob, {
    connection: getRedisConnection(),
    concurrency: 5,
  });

  const heartbeat = setInterval(() => {
    logger.info('worker heartbeat');
  }, HEARTBEAT_INTERVAL_MS);

  const stop = async () => {
    clearInterval(heartbeat);
    await worker.close();
  };

  return { worker, stop };
}

// Entry point (only run when this file is executed directly)
if (
  require.main === module ||
  import.meta.url === `file://${process.argv[1]}`
) {
  const { stop } = startWorker();
  process.on('SIGTERM', async () => {
    await stop();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    await stop();
    process.exit(0);
  });
}
