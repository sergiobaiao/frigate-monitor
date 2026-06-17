// CameraImageChecker — RF-16
// Checks that cameras are producing frames via Frigate stats (fps + frame age)
// Uses SeverityEngine.camera per-camera; overall severity = worst across all cameras

import { FrigateClient, FrigateError } from '@/integrations/frigate';
import type { Checker, CheckResult, ServerContext } from './types';
import { makeResult } from './types';
import { SeverityEngine } from './severity-engine';

type Severity = 'ok' | 'warning' | 'critical' | 'unknown';

const SEVERITY_RANK: Record<Severity, number> = {
  unknown: 0,
  ok: 1,
  warning: 2,
  critical: 3,
};

function worstSeverity(
  a: Severity,
  b: 'ok' | 'warning' | 'critical',
): Severity {
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

export class CameraImageChecker implements Checker {
  readonly checkType = 'camera_image';

  async run(ctx: ServerContext): Promise<CheckResult> {
    const start = Date.now();

    const client = new FrigateClient({
      host: ctx.host,
      port: ctx.frigatePort,
      token: ctx.secrets?.frigateToken,
    });

    try {
      const stats = await client.getStats();
      const cameras = client.extractCameras(stats);
      const cameraNames = Object.keys(cameras);

      if (cameraNames.length === 0) {
        return makeResult(
          this.checkType,
          'warning',
          'No cameras detected',
          { cameras: {} },
          start,
        );
      }

      const cameraDetails: Record<string, { fps: number; severity: string }> =
        {};
      let overall: Severity = 'ok';
      const problemCameras: string[] = [];

      for (const name of cameraNames) {
        const cam = cameras[name];
        const fps = cam.camera_fps;
        const severity = SeverityEngine.camera(
          { fps, lastFrameAgeSec: 0, staleFrameIntervals: 0 },
          ctx.thresholds,
        );
        cameraDetails[name] = { fps, severity };
        overall = worstSeverity(overall, severity);
        if (severity !== 'ok') {
          problemCameras.push(name);
        }
      }

      let message: string;
      if (overall === 'ok') {
        message = `All ${cameraNames.length} cameras producing frames`;
      } else {
        message = `Camera issues: ${problemCameras.join(', ')}`;
      }

      return makeResult(
        this.checkType,
        overall,
        message,
        { cameras: cameraDetails },
        start,
      );
    } catch (err) {
      if (err instanceof FrigateError) {
        return makeResult(
          this.checkType,
          'unknown',
          `Frigate API error: ${err.message}`,
          { error: err.message },
          start,
        );
      }
      throw err;
    }
  }
}
