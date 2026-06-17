import { z } from 'zod';

/**
 * Central environment schema (Constitution P4 — validate at the boundary).
 * Keep entries minimal; add keys as their phase lands (DB in Fase 1, crypto
 * key in Fase 2, Redis in Fase 7, etc.) so a missing-but-unused var never
 * blocks boot.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  SECRET_ENC_KEY: z
    .string()
    .min(44, 'Must be base64-encoded 32-byte key (min 44 chars)')
    .optional(),
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 chars')
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Pure parser — fails fast with a readable message. Kept side-effect free so it
 * is unit-testable without mutating process.env.
 */
export function parseEnv(
  raw: Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const env = parseEnv();
