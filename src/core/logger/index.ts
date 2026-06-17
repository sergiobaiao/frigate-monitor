import pino from 'pino';
import { env } from '@/core/config/env';

/**
 * Structured JSON logger (Constitution O1). Secret-looking keys are censored by
 * pino's redact, and `redactSecrets` is exported for payloads pino can't reach
 * (audit diffs, nested unknown shapes).
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'apiKey',
      'authorization',
      'credential',
      'ciphertext',
      'sshKey',
      'sshPassword',
      'haToken',
      'frigateToken',
      '*.password',
      '*.token',
      '*.secret',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
});

export { redactSecrets } from './redact';
