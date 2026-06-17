// SshClient — read-only, exec only. Constitution P3: no write commands.
// Each exec() opens a new connection (stateless — no persistent connection needed for polling).

import * as crypto from 'crypto';
import { Client } from 'ssh2';
import { type ExecResult, type SshConfig, SshError } from './types';

const READ_ONLY_FORBIDDEN = /[;&|><$()]/;

export class SshClient {
  constructor(private readonly config: SshConfig) {}

  async exec(command: string): Promise<ExecResult> {
    if (!command || command.trim().length === 0) {
      throw new SshError('Command must not be empty', 'EXEC_FAILED');
    }
    if (READ_ONLY_FORBIDDEN.test(command)) {
      throw new SshError(
        'Command contains forbidden characters (read-only guard)',
        'EXEC_FAILED',
      );
    }

    const execTimeoutMs = this.config.execTimeoutMs ?? 30_000;
    const connectTimeoutMs = this.config.connectTimeoutMs ?? 10_000;

    return new Promise<ExecResult>((resolve, reject) => {
      const conn = new Client();
      let settled = false;
      let execTimer: ReturnType<typeof setTimeout> | null = null;

      const done = (result: ExecResult | SshError) => {
        if (settled) return;
        settled = true;
        if (execTimer) clearTimeout(execTimer);
        conn.end();
        if (result instanceof SshError) {
          reject(result);
        } else {
          resolve(result);
        }
      };

      conn.on('error', (err: Error) => {
        const msg = err.message ?? String(err);
        const code = msg.toLowerCase().includes('auth')
          ? 'AUTH_FAILED'
          : 'CONNECT_FAILED';
        done(new SshError(msg, code));
      });

      conn.on('ready', () => {
        const startedAt = new Date();
        const startMs = Date.now();

        execTimer = setTimeout(() => {
          done(
            new SshError(
              `Exec timed out after ${execTimeoutMs}ms`,
              'EXEC_TIMEOUT',
            ),
          );
        }, execTimeoutMs);

        conn.exec(command, (err, stream) => {
          if (err) {
            done(new SshError(err.message, 'EXEC_FAILED'));
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
          });

          stream.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
          });

          stream.on('close', (exitCode: number | null) => {
            done({
              stdout,
              stderr,
              exitCode: exitCode ?? -1,
              durationMs: Date.now() - startMs,
              executedAt: startedAt,
            });
          });
        });
      });

      const connectOptions: Parameters<Client['connect']>[0] = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        readyTimeout: connectTimeoutMs,
        ...(this.config.privateKey
          ? { privateKey: this.config.privateKey }
          : {}),
        ...(this.config.password ? { password: this.config.password } : {}),
      };

      if (this.config.hostFingerprint) {
        const expectedFingerprint = this.config.hostFingerprint;
        connectOptions.hostVerifier = (key: Buffer) => {
          const digest = crypto.createHash('sha256').update(key).digest('hex');
          if (digest !== expectedFingerprint) {
            done(
              new SshError(
                `Host key fingerprint mismatch: expected ${expectedFingerprint}, got ${digest}`,
                'HOST_KEY_MISMATCH',
              ),
            );
            return false;
          }
          return true;
        };
      }

      conn.connect(connectOptions);
    });
  }
}

export type { ExecResult, SshConfig };
export { SshError };
