// Two queues: 'check' (runs server health checks) and 'notify' (sends notifications)
// Redis connection from REDIS_URL env var (default: 'redis://localhost:6379')
// Constitution P5: each queue independent — notify failure never blocks check

import { Queue } from 'bullmq';

// Job data types
export interface CheckJobData {
  serverId: string;
  correlationId: string;
}

export interface NotifyJobData {
  eventId: string;
  serverId: string;
  severity: string;
  message: string;
  channels: string[];
}

// Connection config — lazy, reused across queues
export function getRedisConnection() {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    db: parsed.pathname ? Number(parsed.pathname.slice(1)) || 0 : 0,
  };
}

export function createCheckQueue() {
  return new Queue<CheckJobData>('check', {
    connection: getRedisConnection(),
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
  });
}

export function createNotifyQueue() {
  return new Queue<NotifyJobData>('notify', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  });
}

// Lazy singletons for use in Next.js (server-side only)
let _checkQueue: Queue<CheckJobData> | null = null;
let _notifyQueue: Queue<NotifyJobData> | null = null;

export function getCheckQueue(): Queue<CheckJobData> {
  if (!_checkQueue) _checkQueue = createCheckQueue();
  return _checkQueue;
}

export function getNotifyQueue(): Queue<NotifyJobData> {
  if (!_notifyQueue) _notifyQueue = createNotifyQueue();
  return _notifyQueue;
}
