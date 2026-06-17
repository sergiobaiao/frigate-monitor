// ConnectivityChecker — RF-10
// Tests basic TCP reachability + HTTP response for both server types
// Does NOT use SSH or HA API — just raw TCP/HTTP
// Constitution P3: read-only

import * as net from 'net';
import type { Checker, CheckResult, ServerContext } from './types';
import { makeResult } from './types';

function tcpConnect(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<number> {
  // returns latencyMs
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(Date.now() - start);
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export class ConnectivityChecker implements Checker {
  readonly checkType = 'connectivity';

  async run(ctx: ServerContext): Promise<CheckResult> {
    const startMs = Date.now();

    if (ctx.serverType === 'ubuntu') {
      try {
        const latencyMs = await tcpConnect(ctx.host, ctx.sshPort, 3000);
        return makeResult(
          'connectivity',
          'ok',
          'SSH port reachable',
          { latencyMs },
          startMs,
        );
      } catch (err) {
        const isTimeout = err instanceof Error && err.message === 'timeout';
        if (isTimeout) {
          return makeResult(
            'connectivity',
            'critical',
            'SSH port unreachable',
            { latencyMs: null },
            startMs,
          );
        }
        const isNetworkError =
          err instanceof Error &&
          ('code' in err ||
            err.message === 'timeout' ||
            err.constructor.name !== 'Error');
        if (
          isNetworkError ||
          (err instanceof Error && (err as NodeJS.ErrnoException).code)
        ) {
          return makeResult(
            'connectivity',
            'critical',
            'SSH port unreachable',
            { latencyMs: null },
            startMs,
          );
        }
        const errorType =
          err instanceof Error ? err.constructor.name : 'UnknownError';
        return makeResult(
          'connectivity',
          'unknown',
          `Unexpected error: ${errorType}`,
          { latencyMs: null },
          startMs,
        );
      }
    } else {
      // haos
      try {
        const fetchStart = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(
            `http://${ctx.host}:${ctx.haPort}/api/`,
            {
              signal: controller.signal,
            },
          );
          clearTimeout(timer);
          const latencyMs = Date.now() - fetchStart;
          // Any HTTP status counts as reachable
          return makeResult(
            'connectivity',
            'ok',
            'HA API port reachable',
            { latencyMs, statusCode: response.status },
            startMs,
          );
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const isNetworkError =
          err instanceof Error &&
          (isAbort ||
            err.message.includes('fetch') ||
            err.message.includes('connect') ||
            err.message.includes('network') ||
            (err as NodeJS.ErrnoException).code !== undefined);
        if (isAbort || isNetworkError) {
          return makeResult(
            'connectivity',
            'critical',
            'HA API port unreachable',
            { latencyMs: null },
            startMs,
          );
        }
        const errorType =
          err instanceof Error ? err.constructor.name : 'UnknownError';
        return makeResult(
          'connectivity',
          'unknown',
          `Unexpected error: ${errorType}`,
          { latencyMs: null },
          startMs,
        );
      }
    }
  }
}
