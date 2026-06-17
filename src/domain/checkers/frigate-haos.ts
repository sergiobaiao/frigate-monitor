// FrigateHaosChecker — RF-12
// Uses HA Supervisor API to check Frigate addon state

import { HaClient, HaError } from '@/integrations/ha';
import type { Checker, CheckResult, ServerContext } from './types';
import { makeResult } from './types';

export const FRIGATE_ADDON_SLUG = 'frigate';

export class FrigateHaosChecker implements Checker {
  readonly checkType = 'frigate_haos';

  async run(ctx: ServerContext): Promise<CheckResult> {
    const start = Date.now();

    if (!ctx.secrets?.haToken) {
      return makeResult(
        this.checkType,
        'unknown',
        'HA token not configured',
        undefined,
        start,
      );
    }

    const client = new HaClient({
      host: ctx.host,
      port: ctx.haPort,
      token: ctx.secrets.haToken,
    });

    try {
      const info = await client.getAddonInfo(FRIGATE_ADDON_SLUG);

      const details: Record<string, unknown> = {
        addonState: info.state,
        version: info.version ?? null,
        updateAvailable: info.update_available ?? null,
      };

      if (info.state === 'started') {
        return makeResult(
          this.checkType,
          'ok',
          'Frigate addon running',
          details,
          start,
        );
      }
      if (info.state === 'stopped') {
        return makeResult(
          this.checkType,
          'critical',
          'Frigate addon stopped',
          details,
          start,
        );
      }
      // state === 'unknown'
      return makeResult(
        this.checkType,
        'warning',
        'Frigate addon state unknown',
        details,
        start,
      );
    } catch (err) {
      if (err instanceof HaError) {
        if (err.code === 'AUTH_ERROR') {
          return makeResult(
            this.checkType,
            'critical',
            'HA authentication failed',
            undefined,
            start,
          );
        }
        return makeResult(
          this.checkType,
          'unknown',
          'HA API error',
          { error: err.message },
          start,
        );
      }
      throw err;
    }
  }
}
