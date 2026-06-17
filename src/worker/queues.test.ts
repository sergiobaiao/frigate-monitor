import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stable closure mock for bullmq Queue
const mockQueueInstances: Array<{ name: string; opts: unknown }> = [];
const MockQueue = vi.fn().mockImplementation((name: string, opts: unknown) => {
  const instance = { name, opts };
  mockQueueInstances.push(instance);
  return instance;
});

vi.mock('bullmq', () => ({
  Queue: MockQueue,
}));

// Import after mock is registered
const {
  createCheckQueue,
  createNotifyQueue,
  getCheckQueue,
  getNotifyQueue,
  getRedisConnection,
} = await import('./queues');

describe('getRedisConnection', () => {
  it('parses default REDIS_URL when env not set', () => {
    const original = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    const conn = getRedisConnection();
    expect(conn.host).toBe('localhost');
    expect(conn.port).toBe(6379);
    expect(conn.password).toBeUndefined();
    expect(conn.db).toBe(0);
    process.env.REDIS_URL = original;
  });

  it('parses REDIS_URL with password correctly', () => {
    const original = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://:s3cr3t@redis.internal:6380/2';
    const conn = getRedisConnection();
    expect(conn.host).toBe('redis.internal');
    expect(conn.port).toBe(6380);
    expect(conn.password).toBe('s3cr3t');
    expect(conn.db).toBe(2);
    process.env.REDIS_URL = original;
  });
});

describe('createCheckQueue', () => {
  beforeEach(() => {
    MockQueue.mockClear();
    mockQueueInstances.length = 0;
  });

  it('creates Queue named check with correct connection options', () => {
    delete process.env.REDIS_URL;
    createCheckQueue();
    expect(MockQueue).toHaveBeenCalledOnce();
    const [name, opts] = MockQueue.mock.calls[0] as [
      string,
      { connection: { host: string; port: number } },
    ];
    expect(name).toBe('check');
    expect(opts.connection.host).toBe('localhost');
    expect(opts.connection.port).toBe(6379);
  });

  it('sets removeOnComplete and removeOnFail defaults', () => {
    createCheckQueue();
    const [, opts] = MockQueue.mock.calls[0] as [
      string,
      { defaultJobOptions: { removeOnComplete: number; removeOnFail: number } },
    ];
    expect(opts.defaultJobOptions.removeOnComplete).toBe(100);
    expect(opts.defaultJobOptions.removeOnFail).toBe(500);
  });
});

describe('createNotifyQueue', () => {
  beforeEach(() => {
    MockQueue.mockClear();
  });

  it('creates Queue named notify with retry options (attempts: 3)', () => {
    createNotifyQueue();
    expect(MockQueue).toHaveBeenCalledOnce();
    const [name, opts] = MockQueue.mock.calls[0] as [
      string,
      {
        defaultJobOptions: {
          attempts: number;
          backoff: { type: string; delay: number };
        };
      },
    ];
    expect(name).toBe('notify');
    expect(opts.defaultJobOptions.attempts).toBe(3);
    expect(opts.defaultJobOptions.backoff.type).toBe('exponential');
    expect(opts.defaultJobOptions.backoff.delay).toBe(5000);
  });
});

describe('getCheckQueue singleton', () => {
  it('returns same instance on multiple calls', () => {
    const a = getCheckQueue();
    const b = getCheckQueue();
    expect(a).toBe(b);
  });
});

describe('getNotifyQueue singleton', () => {
  it('returns same instance on multiple calls', () => {
    const a = getNotifyQueue();
    const b = getNotifyQueue();
    expect(a).toBe(b);
  });
});
