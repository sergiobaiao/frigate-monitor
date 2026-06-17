import { describe, it, expect, vi, beforeEach } from 'vitest';

// Top-level vi.fn() — safe to reference in vi.mock factory (both are hoisted)
const mockGetConfig = vi.fn();

vi.mock('@/integrations/frigate', () => ({
  FrigateClient: vi.fn().mockImplementation(() => ({
    getConfig: mockGetConfig,
  })),
  FrigateError: class FrigateError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'FrigateError';
      this.code = code;
    }
  },
}));

import { FrigateRecordingsChecker } from './frigate-recordings';
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
    secrets: { frigateToken: 'tok' },
    correlationId: 'corr-1',
    ...overrides,
  };
}

describe('FrigateRecordingsChecker', () => {
  const checker = new FrigateRecordingsChecker();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recording enabled + retention 7d → ok', async () => {
    mockGetConfig.mockResolvedValue({
      cameras: {
        front_door: {
          enabled: true,
          record: { enabled: true, retain: { days: 7 } },
        },
        backyard: {
          enabled: true,
          record: { enabled: true, retain: { days: 7 } },
        },
      },
      record: { enabled: true, retain: { days: 7 } },
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('ok');
    expect(result.checkType).toBe('frigate_recordings');
    expect(result.details?.retentionDays).toBe(7);
    expect(result.details?.recordingEnabled).toBe(true);
  });

  it('recording disabled globally + no cameras → warning "Recording not enabled"', async () => {
    mockGetConfig.mockResolvedValue({
      cameras: {
        front_door: { enabled: true },
        backyard: { enabled: true },
      },
      record: { enabled: false, retain: { days: 7 } },
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('warning');
    expect(result.message).toBe('Recording not enabled');
  });

  it('retention 0 → warning "Recording retention not configured"', async () => {
    mockGetConfig.mockResolvedValue({
      cameras: { front_door: { enabled: true } },
      record: { enabled: true, retain: { days: 0 } },
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('warning');
    expect(result.message).toBe('Recording retention not configured');
    expect(result.details?.retentionDays).toBe(0);
  });

  it('retention < minRetentionDays → warning', async () => {
    mockGetConfig.mockResolvedValue({
      cameras: { front_door: { enabled: true } },
      record: { enabled: true, retain: { days: 3 } },
    });

    const result = await checker.run(
      makeCtx({ thresholds: { minRetentionDays: 7 } }),
    );

    expect(result.severity).toBe('warning');
    expect(result.message).toContain('3d');
    expect(result.message).toContain('7d');
  });

  it('FrigateError → unknown with error message', async () => {
    const { FrigateError } = await import('@/integrations/frigate');
    mockGetConfig.mockRejectedValue(
      new FrigateError('connection refused', 'NETWORK_ERROR'),
    );

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('unknown');
    expect(result.message).toContain('Frigate API error');
    expect(result.message).toContain('connection refused');
  });

  it('cameras have individual recording enabled, global disabled → ok', async () => {
    mockGetConfig.mockResolvedValue({
      cameras: {
        front_door: {
          enabled: true,
          record: { enabled: true, retain: { days: 7 } },
        },
      },
      record: { enabled: false, retain: { days: 7 } },
    });

    const result = await checker.run(makeCtx());

    // recording enabled via camera-level config
    expect(result.severity).toBe('ok');
    expect(result.details?.recordingEnabled).toBe(true);
  });
});
