// DiskChecker — RF-15
// Ubuntu: SSH → df -PB1 /media/frigate, fallback to df -PB1 /
// HAOS: HA Supervisor /api/hassio/host/info → disk_total/used/free fields
// Stores DiskStat in details for persistence by scheduler

import { HaClient, HaError } from '@/integrations/ha';
import { SshClient, SshError } from '@/integrations/ssh';
import type { Checker, CheckResult, ServerContext } from './types';
import { makeResult } from './types';
import { SeverityEngine } from './severity-engine';

interface DiskStat {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPct: number;
  freePct: number;
  mountPath: string;
}

// Parse POSIX df -PB1 output
// Format:
//   Filesystem     1-blocks      Used Available Use% Mounted on
//   /dev/sda1    500107862016 120000000000 380000000000  24% /
function parseDfOutput(output: string): DiskStat | null {
  const lines = output.trim().split('\n');
  // Find first non-header data line (header starts with "Filesystem")
  const dataLine = lines.find(
    (l) => l.trim().length > 0 && !l.startsWith('Filesystem'),
  );
  if (!dataLine) return null;

  // Split on whitespace — POSIX format: Filesystem 1-blocks Used Available Use% Mounted
  const parts = dataLine.trim().split(/\s+/);
  if (parts.length < 6) return null;

  // col indices: 0=filesystem, 1=1-blocks(total), 2=used, 3=available, 4=use%, 5=mounted
  const totalBytes = parseInt(parts[1], 10);
  const usedBytes = parseInt(parts[2], 10);
  const freeBytes = parseInt(parts[3], 10);
  const usedPctStr = parts[4].replace('%', '');
  const usedPct = parseInt(usedPctStr, 10);
  const mountPath = parts[5];

  if (
    isNaN(totalBytes) ||
    isNaN(usedBytes) ||
    isNaN(freeBytes) ||
    isNaN(usedPct)
  ) {
    return null;
  }

  const freePct = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;

  return { totalBytes, usedBytes, freeBytes, usedPct, freePct, mountPath };
}

export class DiskChecker implements Checker {
  readonly checkType = 'disk';

  async run(ctx: ServerContext): Promise<CheckResult> {
    const start = Date.now();

    if (ctx.serverType === 'ubuntu') {
      return this.runUbuntu(ctx, start);
    }
    return this.runHaos(ctx, start);
  }

  private async runUbuntu(
    ctx: ServerContext,
    start: number,
  ): Promise<CheckResult> {
    const ssh = new SshClient({
      host: ctx.host,
      port: ctx.sshPort,
      username: 'root',
      privateKey: ctx.secrets?.sshKey,
      password: ctx.secrets?.sshPassword,
    });

    try {
      // Try frigate storage path first
      let dfResult = await ssh.exec('df -PB1 /media/frigate');
      let mountPath = '/media/frigate';

      if (dfResult.exitCode !== 0) {
        // Fallback to root filesystem
        dfResult = await ssh.exec('df -PB1 /');
        mountPath = '/';
      }

      const stat = parseDfOutput(dfResult.stdout);
      if (!stat) {
        return makeResult(
          this.checkType,
          'unknown',
          'Failed to parse df output',
          { raw: dfResult.stdout },
          start,
        );
      }

      // Use parsed mountPath from df output if available, else use our fallback label
      const resolvedMount = stat.mountPath !== '' ? stat.mountPath : mountPath;
      const details: Record<string, unknown> = {
        totalBytes: stat.totalBytes,
        usedBytes: stat.usedBytes,
        freeBytes: stat.freeBytes,
        usedPct: stat.usedPct,
        freePct: stat.freePct,
        mountPath: resolvedMount,
      };

      const severity = SeverityEngine.disk(
        { usedPct: stat.usedPct, freePct: stat.freePct },
        ctx.thresholds,
      );

      const msg = `Disk ${stat.usedPct}% used (${resolvedMount})`;
      return makeResult(this.checkType, severity, msg, details, start);
    } catch (err) {
      if (err instanceof SshError) {
        return makeResult(
          this.checkType,
          'unknown',
          `SSH error: ${err.message}`,
          { error: err.message, code: err.code },
          start,
        );
      }
      throw err;
    }
  }

  private async runHaos(
    ctx: ServerContext,
    start: number,
  ): Promise<CheckResult> {
    if (!ctx.secrets?.haToken) {
      return makeResult(
        this.checkType,
        'unknown',
        'HA token not configured',
        undefined,
        start,
      );
    }

    const ha = new HaClient({
      host: ctx.host,
      port: ctx.haPort,
      token: ctx.secrets.haToken,
    });

    try {
      const info = await ha.getHostInfo();

      const { disk_total, disk_used, disk_free } = info;

      if (
        disk_total === undefined ||
        disk_used === undefined ||
        disk_free === undefined
      ) {
        return makeResult(
          this.checkType,
          'unknown',
          'Disk info unavailable',
          undefined,
          start,
        );
      }

      const usedPct = disk_total > 0 ? (disk_used / disk_total) * 100 : 0;
      const freePct = disk_total > 0 ? (disk_free / disk_total) * 100 : 0;

      const details: Record<string, unknown> = {
        totalBytes: disk_total,
        usedBytes: disk_used,
        freeBytes: disk_free,
        usedPct,
        freePct,
        mountPath: '/',
      };

      const severity = SeverityEngine.disk(
        { usedPct, freePct },
        ctx.thresholds,
      );
      const msg = `Disk ${usedPct.toFixed(1)}% used`;
      return makeResult(this.checkType, severity, msg, details, start);
    } catch (err) {
      if (err instanceof HaError) {
        return makeResult(
          this.checkType,
          'unknown',
          `HA API error: ${err.message}`,
          { error: err.message },
          start,
        );
      }
      throw err;
    }
  }
}
