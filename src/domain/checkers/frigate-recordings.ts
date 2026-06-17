// FrigateRecordingsChecker — RF-14
// Checks per-camera recording retention via Frigate API
// Uses Frigate /api/config to get retention days setting

import { FrigateClient, FrigateError } from '@/integrations/frigate';
import type { Checker, CheckResult, ServerContext } from './types';
import { makeResult } from './types';

export class FrigateRecordingsChecker implements Checker {
  readonly checkType = 'frigate_recordings';

  async run(ctx: ServerContext): Promise<CheckResult> {
    const start = Date.now();

    const client = new FrigateClient({
      host: ctx.host,
      port: ctx.frigatePort,
      token: ctx.secrets?.frigateToken,
    });

    try {
      const config = await client.getConfig();

      const globalRecordEnabled = config.record?.enabled ?? false;
      const globalRetentionDays = config.record?.retain?.days ?? 0;

      const cameraNames = Object.keys(config.cameras);

      // Check if any camera has recording enabled
      const anyCameraRecordEnabled = cameraNames.some(
        (name) => config.cameras[name]?.record?.enabled === true,
      );

      const recordingEnabled = globalRecordEnabled || anyCameraRecordEnabled;

      const details: Record<string, unknown> = {
        recordingEnabled,
        retentionDays: globalRetentionDays,
        cameras: cameraNames,
      };

      if (!recordingEnabled) {
        return makeResult(
          this.checkType,
          'warning',
          'Recording not enabled',
          details,
          start,
        );
      }

      const minRetentionDays = ctx.thresholds.minRetentionDays ?? 1;

      if (globalRetentionDays === 0) {
        return makeResult(
          this.checkType,
          'warning',
          'Recording retention not configured',
          details,
          start,
        );
      }

      if (globalRetentionDays < minRetentionDays) {
        return makeResult(
          this.checkType,
          'warning',
          `Recording retention ${globalRetentionDays}d below minimum ${minRetentionDays}d`,
          details,
          start,
        );
      }

      return makeResult(
        this.checkType,
        'ok',
        `Recording enabled with ${globalRetentionDays}d retention`,
        details,
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
