import { describe, it, expect } from 'vitest';
import { redactSecrets, REDACTED } from './redact';

describe('redactSecrets', () => {
  it('redacts secret-looking keys at any depth', () => {
    const input = {
      name: 'srv-01',
      sshPassword: 'hunter2',
      ha: { token: 'llat_abc', port: 8123 },
      list: [{ apiKey: 'k', ok: true }],
    };
    const out = redactSecrets(input);
    expect(out.name).toBe('srv-01');
    expect(out.sshPassword).toBe(REDACTED);
    expect(out.ha.token).toBe(REDACTED);
    expect(out.ha.port).toBe(8123);
    expect(out.list[0].apiKey).toBe(REDACTED);
    expect(out.list[0].ok).toBe(true);
  });

  it('does not mutate the original object', () => {
    const input = { token: 'abc' };
    redactSecrets(input);
    expect(input.token).toBe('abc');
  });

  it('passes primitives through', () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets('x')).toBe('x');
    expect(redactSecrets(null)).toBe(null);
  });
});
