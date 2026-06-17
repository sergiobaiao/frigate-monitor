import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stable closure pattern for net mock — must be declared before vi.mock
const netMock = {} as { connect: ReturnType<typeof vi.fn> };
vi.mock('net', () => ({
  createConnection: (...args: unknown[]) => netMock.connect?.(...args),
}));

import { ConnectivityChecker } from './connectivity';
import type { ServerContext } from './types';

function makeCtx(overrides: Partial<ServerContext> = {}): ServerContext {
  return {
    serverId: 'server-1',
    serverType: 'ubuntu',
    host: '192.168.1.10',
    sshPort: 22,
    haPort: 8123,
    frigatePort: 5000,
    thresholds: {},
    correlationId: 'corr-1',
    ...overrides,
  };
}

// Helper: create a fake EventEmitter-like socket
function makeFakeSocket() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const socket = {
    on(event: string, cb: (...args: unknown[]) => void) {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
      return socket;
    },
    destroy: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      for (const cb of handlers[event] ?? []) cb(...args);
    },
  };
  return socket;
}

describe('ConnectivityChecker', () => {
  const checker = new ConnectivityChecker();

  beforeEach(() => {
    netMock.connect = vi.fn();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('ubuntu — TCP connect success → severity ok, latencyMs in details', async () => {
    const socket = makeFakeSocket();
    netMock.connect = vi.fn(() => {
      setTimeout(() => socket.emit('connect'), 5);
      return socket;
    });

    const result = await checker.run(makeCtx({ serverType: 'ubuntu' }));

    expect(result.severity).toBe('ok');
    expect(result.message).toBe('SSH port reachable');
    expect(result.details).toHaveProperty('latencyMs');
    expect(typeof result.details?.latencyMs).toBe('number');
    expect(result.checkType).toBe('connectivity');
  });

  it('ubuntu — TCP connect failure → severity critical', async () => {
    const socket = makeFakeSocket();
    netMock.connect = vi.fn(() => {
      const err = Object.assign(new Error('ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      });
      setTimeout(() => socket.emit('error', err), 5);
      return socket;
    });

    const result = await checker.run(makeCtx({ serverType: 'ubuntu' }));

    expect(result.severity).toBe('critical');
    expect(result.message).toBe('SSH port unreachable');
  });

  it('haos — HTTP success → severity ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 200, ok: true }),
    );

    const result = await checker.run(makeCtx({ serverType: 'haos' }));

    expect(result.severity).toBe('ok');
    expect(result.message).toBe('HA API port reachable');
    expect(result.details).toHaveProperty('latencyMs');
    expect(result.details).toHaveProperty('statusCode', 200);
  });

  it('haos — HTTP failure → severity critical', async () => {
    const networkError = Object.assign(new TypeError('Failed to fetch'), {
      code: 'ECONNREFUSED',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

    const result = await checker.run(makeCtx({ serverType: 'haos' }));

    expect(result.severity).toBe('critical');
    expect(result.message).toBe('HA API port unreachable');
  });

  it('ubuntu — TCP timeout → severity critical (not unknown)', async () => {
    const socket = makeFakeSocket();
    netMock.connect = vi.fn(() => {
      // Never emits connect or error — timeout fires
      return socket;
    });

    // Use fake timers so the 3s timeout fires immediately
    vi.useFakeTimers();
    const runPromise = checker.run(makeCtx({ serverType: 'ubuntu' }));
    await vi.runAllTimersAsync();
    const result = await runPromise;
    vi.useRealTimers();

    expect(result.severity).toBe('critical');
    expect(result.message).toBe('SSH port unreachable');
  });

  it('ubuntu — unexpected error (no code) → severity unknown', async () => {
    const socket = makeFakeSocket();
    netMock.connect = vi.fn(() => {
      // Emit a plain Error with no code (not a network error)
      setTimeout(
        () => socket.emit('error', new Error('something truly unexpected')),
        5,
      );
      return socket;
    });

    const result = await checker.run(makeCtx({ serverType: 'ubuntu' }));

    expect(result.severity).toBe('unknown');
    expect(result.message).toContain('Error');
  });
});
