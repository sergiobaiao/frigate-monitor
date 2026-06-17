import { describe, it, expect, vi, beforeEach } from 'vitest';

// Top-level vi.fn() — safe to reference in vi.mock factory (both are hoisted)
const mockGetStats = vi.fn();
const mockExtractCameras = vi.fn();

vi.mock('@/integrations/frigate', () => ({
  FrigateClient: vi.fn().mockImplementation(() => ({
    getStats: mockGetStats,
    extractCameras: mockExtractCameras,
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

import { CameraImageChecker } from './camera-image';
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

function makeCameraStats(fps: number) {
  return {
    camera_fps: fps,
    process_fps: fps,
    skipped_fps: 0,
    detection_fps: 0,
  };
}

const STUB_STATS = {};

describe('CameraImageChecker', () => {
  const checker = new CameraImageChecker();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStats.mockResolvedValue(STUB_STATS);
  });

  it('all cameras at fps 5 → ok with count in message', async () => {
    mockExtractCameras.mockReturnValue({
      front_door: makeCameraStats(5),
      backyard: makeCameraStats(5),
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('ok');
    expect(result.message).toContain('2 cameras');
    expect(result.checkType).toBe('camera_image');
  });

  it('one camera at fps 0 → critical with camera name in details', async () => {
    mockExtractCameras.mockReturnValue({
      front_door: makeCameraStats(5),
      backyard: makeCameraStats(0),
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('critical');
    expect(result.message).toContain('backyard');
    const cameras = result.details?.cameras as Record<
      string,
      { fps: number; severity: string }
    >;
    expect(cameras['backyard'].severity).toBe('critical');
    expect(cameras['backyard'].fps).toBe(0);
  });

  it('all cameras fps 0 → critical', async () => {
    mockExtractCameras.mockReturnValue({
      front_door: makeCameraStats(0),
      backyard: makeCameraStats(0),
    });

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('critical');
  });

  it('no cameras → warning "No cameras detected"', async () => {
    mockExtractCameras.mockReturnValue({});

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('warning');
    expect(result.message).toBe('No cameras detected');
  });

  it('FrigateError → unknown with error message', async () => {
    const { FrigateError } = await import('@/integrations/frigate');
    mockGetStats.mockRejectedValue(new FrigateError('timeout', 'TIMEOUT'));

    const result = await checker.run(makeCtx());

    expect(result.severity).toBe('unknown');
    expect(result.message).toContain('Frigate API error');
    expect(result.message).toContain('timeout');
  });
});
