import { RateLimiterMemory } from 'rate-limiter-flexible';

// 10 attempts per 15 minutes per IP
const authLimiter = new RateLimiterMemory({
  points: 10,
  duration: 15 * 60,
});

// 100 requests per minute per userId
const mutationLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterSec}s`);
    this.name = 'RateLimitError';
  }
}

export async function checkRateLimit(
  type: 'auth' | 'mutation',
  key: string,
): Promise<void> {
  const limiter = type === 'auth' ? authLimiter : mutationLimiter;
  try {
    await limiter.consume(key);
  } catch (err) {
    // RateLimiterRes has msBeforeNext
    const msBeforeNext =
      err && typeof err === 'object' && 'msBeforeNext' in err
        ? (err as { msBeforeNext: number }).msBeforeNext
        : 60000;
    throw new RateLimitError(Math.ceil(msBeforeNext / 1000));
  }
}
