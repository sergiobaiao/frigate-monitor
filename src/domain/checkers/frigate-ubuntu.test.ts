import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServerContext } from './types';
import { SshError } from '@/integrations/ssh';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURE_OK = JSON.stringify({
  status: 'ok',
  frigate_running: true,
  storage: { usage_percent: 20 },
  cameras: {},
});

const FIXTURE_NOT_RUNNING = JSON.stringify({
  status: 'critical',
  frigate_running: false,
});

const FIXTURE_MALFORMED =
  '{"status":"warning","storage":{"usage_percent": -},"cameras":{}}';

// ─── Mock @/integrations/ssh ─────────────────────────────────────────────────
// Stable closure pattern: module-level object that vi.mock factory closes over.
// Avoids vi.hoisted issues with real module mocking in jsdom env.

interface MockSshState {
  execImpl: (cmd: string) => Promise<{ stdout: string; exitCode: number }>;
}

const sshMock: MockSshState = {
  execImpl: async () => ({ stdout: '', exitCode: 0 }),
};

vi.mock('@/integrations/ssh', () => {
  class MockSshClient {
    constructor(_config: unknown) {}
    async exec(cmd: string) {
      return sshMock.execImpl(cmd);
    }
  }
  class MockSshError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'SshError';
      this.code = code;
    }
  }
  return { SshClient: MockSshClient, SshError: MockSshError };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ServerContext> = {}): ServerContext {
  return {
    serverId: 'srv-1',
    serverType: 'ubuntu',
    host: '192.168.1.10',
    sshPort: 22,
    haPort: 8123,
    frigatePort: 5000,
    thresholds: {},
    secrets: { sshPassword: 'secret' },
    correlationId: 'corr-test',
    ...overrides,
  };
}

// Sequence helper: first call returns a, second returns b
function twoExecs(
  firstStdout: string,
  firstExit: number,
  secondStdout: string,
  secondExit: number,
) {
  let call = 0;
  sshMock.execImpl = async (_cmd: string) => {
    call++;
    if (call === 1) return { stdout: firstStdout, exitCode: firstExit };
    return { stdout: secondStdout, exitCode: secondExit };
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FrigateUbuntuChecker', () => {
  beforeEach(async () => {
    // Reset to safe default
    twoExecs(FIXTURE_OK, 0, '', 0);
  });

  it('valid JSON + exit 0 → ok', async () => {
    twoExecs(FIXTURE_OK, 0, '', 0);
    const { FrigateUbuntuChecker } = await import('./frigate-ubuntu');
    const checker = new FrigateUbuntuChecker();
    const result = await checker.run(makeCtx());
    expect(result.severity).toBe('ok');
    expect(result.checkType).toBe('frigate_ubuntu');
    expect(result.details?.frigateRunning).toBe(true);
    expect(result.details?.exitCode).toBe(0);
  });

  it('valid JSON + frigate_running: false → critical', async () => {
    twoExecs(FIXTURE_NOT_RUNNING, 0, '', 0);
    const { FrigateUbuntuChecker } = await import('./frigate-ubuntu');
    const checker = new FrigateUbuntuChecker();
    const result = await checker.run(makeCtx());
    expect(result.severity).toBe('critical');
    expect(result.details?.frigateRunning).toBe(false);
    expect(result.message).toMatch(/not running/i);
  });

  it('valid JSON + exit 2 → critical', async () => {
    twoExecs(FIXTURE_OK, 0, '', 2);
    const { FrigateUbuntuChecker } = await import('./frigate-ubuntu');
    const checker = new FrigateUbuntuChecker();
    const result = await checker.run(makeCtx());
    expect(result.severity).toBe('critical');
    expect(result.details?.exitCode).toBe(2);
  });

  it('malformed JSON (usage_percent: -) → critical "malformed"', async () => {
    twoExecs(FIXTURE_MALFORMED, 0, '', 0);
    const { FrigateUbuntuChecker } = await import('./frigate-ubuntu');
    const checker = new FrigateUbuntuChecker();
    const result = await checker.run(makeCtx());
    expect(result.severity).toBe('critical');
    expect(result.message).toMatch(/malformed/i);
  });

  it('non-JSON output → critical "malformed"', async () => {
    twoExecs('not valid json at all', 0, '', 0);
    const { FrigateUbuntuChecker } = await import('./frigate-ubuntu');
    const checker = new FrigateUbuntuChecker();
    const result = await checker.run(makeCtx());
    expect(result.severity).toBe('critical');
    expect(result.message).toMatch(/malformed/i);
  });

  it('SSH connection error → unknown "SSH connection failed"', async () => {
    sshMock.execImpl = async () => {
      throw new SshError('Connection refused', 'CONNECT_FAILED');
    };
    const { FrigateUbuntuChecker } = await import('./frigate-ubuntu');
    const checker = new FrigateUbuntuChecker();
    const result = await checker.run(makeCtx());
    expect(result.severity).toBe('unknown');
    expect(result.message).toMatch(/SSH connection failed/i);
  });

  it('exit 1 (warn) + running: true → warning', async () => {
    twoExecs(FIXTURE_OK, 0, '', 1);
    const { FrigateUbuntuChecker } = await import('./frigate-ubuntu');
    const checker = new FrigateUbuntuChecker();
    const result = await checker.run(makeCtx());
    expect(result.severity).toBe('warning');
    expect(result.details?.frigateRunning).toBe(true);
    expect(result.details?.exitCode).toBe(1);
  });

  it('result includes rawJson truncated in details', async () => {
    twoExecs(FIXTURE_OK, 0, '', 0);
    const { FrigateUbuntuChecker } = await import('./frigate-ubuntu');
    const checker = new FrigateUbuntuChecker();
    const result = await checker.run(makeCtx());
    expect(typeof result.details?.rawJson).toBe('string');
  });

  it('result has durationMs and checkedAt', async () => {
    twoExecs(FIXTURE_OK, 0, '', 0);
    const { FrigateUbuntuChecker } = await import('./frigate-ubuntu');
    const checker = new FrigateUbuntuChecker();
    const result = await checker.run(makeCtx());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.checkedAt).toBeInstanceOf(Date);
  });
});
