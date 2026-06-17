import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FrigateHaosChecker, FRIGATE_ADDON_SLUG } from './frigate-haos';
import type { ServerContext } from './types';

// Stable mock closure
const mockGetAddonInfo = vi.fn();

vi.mock('@/integrations/ha', () => ({
  HaClient: vi.fn().mockImplementation(() => ({
    getAddonInfo: mockGetAddonInfo,
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

function makeCtx(overrides: Partial<ServerContext> = {}): ServerContext {
  return {
    serverId: 'srv-1',
    serverType: 'haos',
    host: '192.168.1.10',
    sshPort: 22,
    haPort: 8123,
    frigatePort: 5000,
    thresholds: {},
    secrets: { haToken: 'test-token' },
    correlationId: 'corr-1',
    ...overrides,
  };
}

describe('FrigateHaosChecker', () => {
  const checker = new FrigateHaosChecker();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('addon state started → ok', async () => {
    mockGetAddonInfo.mockResolvedValue({
      name: 'Frigate NVR',
      slug: FRIGATE_ADDON_SLUG,
      state: 'started',
      version: '0.17.1',
      update_available: false,
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('ok');
    expect(result.checkType).toBe('frigate_haos');
    expect(result.details).toMatchObject({ addonState: 'started' });
  });

  it('addon state stopped → critical', async () => {
    mockGetAddonInfo.mockResolvedValue({
      name: 'Frigate NVR',
      slug: FRIGATE_ADDON_SLUG,
      state: 'stopped',
      version: '0.17.1',
      update_available: false,
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('critical');
    expect(result.message).toContain('stopped');
    expect(result.details).toMatchObject({ addonState: 'stopped' });
  });

  it('addon state unknown → warning', async () => {
    mockGetAddonInfo.mockResolvedValue({
      name: 'Frigate NVR',
      slug: FRIGATE_ADDON_SLUG,
      state: 'unknown',
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('warning');
    expect(result.message).toContain('unknown');
  });

  it('no haToken → unknown "not configured"', async () => {
    const result = await checker.run(makeCtx({ secrets: {} }));

    expect(result.severity).toBe('unknown');
    expect(result.message).toContain('not configured');
    expect(mockGetAddonInfo).not.toHaveBeenCalled();
  });

  it('HaError AUTH_ERROR → critical "authentication failed"', async () => {
    const { HaError } = await import('@/integrations/ha');
    mockGetAddonInfo.mockRejectedValue(
      new HaError('Unauthorized', 'AUTH_ERROR'),
    );

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('critical');
    expect(result.message).toContain('authentication failed');
  });

  it('HaError network → unknown "HA API error"', async () => {
    const { HaError } = await import('@/integrations/ha');
    mockGetAddonInfo.mockRejectedValue(
      new HaError('connect ECONNREFUSED', 'NETWORK_ERROR'),
    );

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('unknown');
    expect(result.message).toContain('HA API error');
  });
});
