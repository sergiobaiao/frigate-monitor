// HaStorageChecker — RF-13
// Checks HA Supervisor network mount states

import { HaClient, HaError } from '@/integrations/ha';
import type { Checker, CheckResult, ServerContext } from './types';
import { makeResult } from './types';

export class HaStorageChecker implements Checker {
  readonly checkType = 'ha_storage';

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
      const { mounts } = await client.getMounts();

      const totalMounts = mounts.length;
      const activeMounts = mounts.filter((m) => m.state === 'active').length;
      const failedMounts = mounts.filter((m) => m.state === 'failed').length;
      const unknownMounts = mounts.filter((m) => m.state === 'unknown').length;
      const failedNames = mounts
        .filter((m) => m.state === 'failed')
        .map((m) => m.name);

      const details: Record<string, unknown> = {
        totalMounts,
        activeMounts,
        failedMounts,
        failedNames,
      };

      if (totalMounts === 0) {
        return makeResult(
          this.checkType,
          'ok',
          'No network mounts configured',
          details,
          start,
        );
      }

      if (failedMounts > 0) {
        return makeResult(
          this.checkType,
          'critical',
          `${failedMounts} mount(s) failed: ${failedNames.join(', ')}`,
          details,
          start,
        );
      }

      if (unknownMounts > 0) {
        return makeResult(
          this.checkType,
          'warning',
          `${unknownMounts} mount(s) state unknown`,
          details,
          start,
        );
      }

      return makeResult(
        this.checkType,
        'ok',
        `All ${totalMounts} mounts active`,
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
