export interface SshConfig {
  host: string;
  port: number; // default 22
  username: string; // default 'root' or configured
  privateKey?: string; // PEM string
  password?: string;
  hostFingerprint?: string; // SHA256 hex — if set, verify; reject if mismatch
  connectTimeoutMs?: number; // default 10_000
  execTimeoutMs?: number; // default 30_000
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  executedAt: Date;
}

export class SshError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'CONNECT_FAILED'
      | 'AUTH_FAILED'
      | 'HOST_KEY_MISMATCH'
      | 'EXEC_TIMEOUT'
      | 'EXEC_FAILED',
  ) {
    super(message);
    this.name = 'SshError';
  }
}
