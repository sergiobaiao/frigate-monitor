import { describe, it, expect, vi, beforeEach } from 'vitest';

// Top-level vi.fn() — safe to reference in vi.mock factory (both are hoisted)
const mockSshExec = vi.fn();
const mockGetHostInfo = vi.fn();

vi.mock('@/integrations/ssh', () => ({
  SshClient: vi.fn().mockImplementation(() => ({
    exec: mockSshExec,
  })),
  SshError: class SshError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'SshError';
      this.code = code;
    }
  },
}));

vi.mock('@/integrations/ha', () => ({
  HaClient: vi.fn().mockImplementation(() => ({
    getHostInfo: mockGetHostInfo,
  })),
  HaError: class HaError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'HaError';
      this.code = code;
    }
  },
}));

import { SshError } from '@/integrations/ssh';
import { DiskChecker } from './disk';
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
    secrets: { sshKey: 'key', haToken: 'hatoken' },
    correlationId: 'corr-1',
    ...overrides,
  };
}

function makeDfOutput(
  total: number,
  used: number,
  available: number,
  usedPct: number,
  mount = '/',
): string {
  return [
    'Filesystem     1-blocks      Used Available Use% Mounted on',
    `/dev/sda1    ${total} ${used} ${available}  ${usedPct}% ${mount}`,
  ].join('\n');
}

function dfResult(stdout: string, exitCode = 0) {
  return {
    stdout,
    stderr: '',
    exitCode,
    durationMs: 100,
    executedAt: new Date(),
  };
}

describe('DiskChecker', () => {
  const checker = new DiskChecker();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Ubuntu', () => {
    it('df output with 24% used → ok', async () => {
      mockSshExec.mockResolvedValueOnce(
        dfResult(makeDfOutput(500107862016, 120000000000, 380000000000, 24)),
      );

      const result = await checker.run(makeCtx({ serverType: 'ubuntu' }));

      expect(result.severity).toBe('ok');
      expect(result.checkType).toBe('disk');
      expect(result.details?.usedPct).toBe(24);
    });

    it('df output with 85% used → warning', async () => {
      // available = 15% of total to stay above minFreePct=15 threshold
      const total = 500000000000;
      const used = 425000000000; // 85%
      const available = 75000000000; // 15% — at boundary, not below
      mockSshExec.mockResolvedValueOnce(
        dfResult(makeDfOutput(total, used, available, 85)),
      );

      const result = await checker.run(makeCtx({ serverType: 'ubuntu' }));

      expect(result.severity).toBe('warning');
      expect(result.details?.usedPct).toBe(85);
    });

    it('df output with 93% used → critical', async () => {
      mockSshExec.mockResolvedValueOnce(
        dfResult(makeDfOutput(500107862016, 465100291275, 35007570741, 93)),
      );

      const result = await checker.run(makeCtx({ serverType: 'ubuntu' }));

      expect(result.severity).toBe('critical');
      expect(result.details?.usedPct).toBe(93);
    });

    it('SshError → unknown', async () => {
      mockSshExec.mockRejectedValue(
        new SshError('Connection refused', 'CONNECT_FAILED'),
      );

      const result = await checker.run(makeCtx({ serverType: 'ubuntu' }));

      expect(result.severity).toBe('unknown');
      expect(result.message).toContain('SSH error');
      expect(result.message).toContain('Connection refused');
    });

    it('/media/frigate fails (exitCode 1) → fallback to /', async () => {
      // First call: /media/frigate fails
      mockSshExec.mockResolvedValueOnce(dfResult('', 1));
      // Second call: / succeeds
      mockSshExec.mockResolvedValueOnce(
        dfResult(makeDfOutput(500107862016, 120000000000, 380000000000, 24)),
      );

      const result = await checker.run(makeCtx({ serverType: 'ubuntu' }));

      expect(result.severity).toBe('ok');
      expect(mockSshExec).toHaveBeenCalledTimes(2);
    });

    it('parses df output with extra whitespace correctly', async () => {
      const extraWhitespace = [
        'Filesystem     1-blocks      Used Available Use% Mounted on',
        '  /dev/sda1    500107862016   120000000000  380000000000   24%  /',
      ].join('\n');

      mockSshExec.mockResolvedValueOnce(dfResult(extraWhitespace));

      const result = await checker.run(makeCtx({ serverType: 'ubuntu' }));

      expect(result.severity).toBe('ok');
      expect(result.details?.usedPct).toBe(24);
      expect(result.details?.totalBytes).toBe(500107862016);
    });
  });

  describe('HAOS', () => {
    it('hostInfo with 30% used → ok', async () => {
      const total = 250000000000;
      const used = 75000000000;
      const free = 175000000000;
      mockGetHostInfo.mockResolvedValue({
        hostname: 'homeassistant',
        disk_total: total,
        disk_used: used,
        disk_free: free,
      });

      const result = await checker.run(makeCtx({ serverType: 'haos' }));

      expect(result.severity).toBe('ok');
      expect(result.checkType).toBe('disk');
      expect(result.details?.totalBytes).toBe(total);
      expect(result.details?.usedBytes).toBe(used);
    });

    it('hostInfo with 92% used → critical', async () => {
      const total = 250000000000;
      const used = 230000000000;
      const free = 20000000000;
      mockGetHostInfo.mockResolvedValue({
        hostname: 'homeassistant',
        disk_total: total,
        disk_used: used,
        disk_free: free,
      });

      const result = await checker.run(makeCtx({ serverType: 'haos' }));

      expect(result.severity).toBe('critical');
    });

    it('missing disk_total → unknown "Disk info unavailable"', async () => {
      mockGetHostInfo.mockResolvedValue({
        hostname: 'homeassistant',
        // no disk_total/used/free
      });

      const result = await checker.run(makeCtx({ serverType: 'haos' }));

      expect(result.severity).toBe('unknown');
      expect(result.message).toBe('Disk info unavailable');
    });
  });
});
