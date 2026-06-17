import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SshClient } from './index';
import type { SshConfig } from './types';

// vi.hoisted cannot be used here because vitest's transform fails to resolve vi
// inside vi.hoisted callbacks when mocking real npm packages (ssh2) in jsdom env.
// Pattern: stable module-level object that vi.mock factory closes over; fns set in beforeEach.
interface MockState {
  instances: EventEmitter[];
  exec: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}
const ms = {} as MockState;

vi.mock('ssh2', () => {
  // require() is unavoidable inside vi.mock() factories — imports are hoisted out of scope
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('events') as typeof import('events');
  class MockClient extends EE {
    constructor() {
      super();
      ms.instances.push(this as unknown as EventEmitter);
    }
    exec(...args: unknown[]) {
      return ms.exec?.(...args);
    }
    connect(...args: unknown[]) {
      return ms.connect?.(...args);
    }
    end(...args: unknown[]) {
      return ms.end?.(...args);
    }
  }
  return { Client: MockClient };
});

function makeClient(overrides: Partial<SshConfig> = {}) {
  return new SshClient({
    host: 'test-host',
    port: 22,
    username: 'root',
    password: 'secret',
    ...overrides,
  });
}

function simulateSuccess(stdout: string, stderr: string, exitCode: number) {
  const instance = ms.instances[ms.instances.length - 1]!;
  instance.emit('ready');

  const calls = ms.exec.mock.calls as Array<
    [
      string,
      (
        err: null | Error,
        stream: EventEmitter & { stderr: EventEmitter },
      ) => void,
    ]
  >;
  const execCb = calls[calls.length - 1]![1]!;

  const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  stream.stderr = new EventEmitter();
  execCb(null, stream);

  if (stdout) stream.emit('data', Buffer.from(stdout));
  if (stderr) stream.stderr.emit('data', Buffer.from(stderr));
  stream.emit('close', exitCode);
}

describe('SshClient', () => {
  beforeEach(() => {
    ms.instances = [];
    ms.exec = vi.fn();
    ms.connect = vi.fn();
    ms.end = vi.fn();
  });

  it('returns stdout/stderr/exitCode/durationMs/executedAt on success', async () => {
    const client = makeClient();
    const promise = client.exec('uptime');

    simulateSuccess('load avg: 0.1', 'some warn', 0);

    const result = await promise;
    expect(result.stdout).toBe('load avg: 0.1');
    expect(result.stderr).toBe('some warn');
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.executedAt).toBeInstanceOf(Date);
  });

  it('throws SshError EXEC_FAILED for command with semicolon', async () => {
    const client = makeClient();
    await expect(client.exec('ls; rm -rf /')).rejects.toMatchObject({
      name: 'SshError',
      code: 'EXEC_FAILED',
    });
  });

  it('throws SshError EXEC_FAILED for empty command', async () => {
    const client = makeClient();
    await expect(client.exec('')).rejects.toMatchObject({
      name: 'SshError',
      code: 'EXEC_FAILED',
    });
  });

  it('throws SshError CONNECT_FAILED when ssh2 emits error', async () => {
    const client = makeClient();
    const promise = client.exec('uptime');

    const instance = ms.instances[0]!;
    instance.emit('error', new Error('Connection refused'));

    await expect(promise).rejects.toMatchObject({
      name: 'SshError',
      code: 'CONNECT_FAILED',
    });
  });

  it('calls conn.end() after successful exec (connection cleanup)', async () => {
    const client = makeClient();
    const promise = client.exec('uptime');

    simulateSuccess('ok', '', 0);

    await promise;
    expect(ms.end).toHaveBeenCalledOnce();
  });

  it('throws SshError HOST_KEY_MISMATCH when fingerprint does not match', async () => {
    const client = makeClient({ hostFingerprint: 'deadbeef' });
    const promise = client.exec('uptime');

    const connectCalls = ms.connect.mock.calls as Array<
      [{ hostVerifier?: (key: Buffer) => boolean }]
    >;
    const connectOpts = connectCalls[connectCalls.length - 1]![0]!;
    expect(connectOpts.hostVerifier).toBeDefined();

    const fakeKey = Buffer.from('not-matching-key');
    const verifyResult = connectOpts.hostVerifier!(fakeKey);
    expect(verifyResult).toBe(false);

    await expect(promise).rejects.toMatchObject({
      name: 'SshError',
      code: 'HOST_KEY_MISMATCH',
    });
  });
});
