/**
 * Field-name patterns that must never reach logs, audit diffs, or API output
 * (Constitution P2). Matching is case-insensitive on the key name.
 */
export const SECRET_KEY_PATTERN =
  /(pass(word)?|secret|token|api[-_]?key|authorization|credential|ciphertext|private[-_]?key|ssh[-_]?key)/i;

export const REDACTED = '[REDACTED]';

/**
 * Deep-clone a value with any secret-looking field redacted. Used for audit
 * before/after diffs and any structured log payload. Non-mutating.
 */
export function redactSecrets<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, seen)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key)
      ? REDACTED
      : redactSecrets(val, seen);
  }
  return out as T;
}
