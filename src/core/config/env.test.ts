import { describe, it, expect } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applies defaults when optional vars are absent', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('accepts valid overrides', () => {
    const env = parseEnv({ NODE_ENV: 'production', LOG_LEVEL: 'warn' });
    expect(env.NODE_ENV).toBe('production');
    expect(env.LOG_LEVEL).toBe('warn');
  });

  it('throws on an invalid enum value', () => {
    expect(() => parseEnv({ LOG_LEVEL: 'verbose' })).toThrow(
      /Invalid environment configuration/,
    );
  });
});
