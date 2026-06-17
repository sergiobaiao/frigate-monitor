import type { Severity } from '@/generated/prisma';

// ServerContext: everything a checker needs to run (no DB access inside checker)
export interface ServerContext {
  serverId: string;
  serverType: 'ubuntu' | 'haos';
  host: string;
  sshPort: number;
  haPort: number;
  frigatePort: number;
  thresholds: {
    warnPct?: number; // default 75
    critPct?: number; // default 90
    minFreePct?: number; // default 15
    emergencyPct?: number; // default 95
    staleFrameIntervals?: number; // default 3
    minRetentionDays?: number; // default 1
  };
  // Decrypted secrets (provided by scheduler before running check)
  secrets?: {
    sshKey?: string;
    sshPassword?: string;
    haToken?: string;
    frigateToken?: string;
  };
  correlationId: string;
}

// CheckResult: what every checker returns
export interface CheckResult {
  checkType: string; // e.g. 'connectivity', 'frigate_ubuntu', 'disk'
  severity: Severity; // ok | warning | critical | unknown
  message: string; // human-readable summary
  details?: Record<string, unknown>; // raw data for storage
  durationMs: number;
  checkedAt: Date;
}

// Checker interface — all checkers implement this
export interface Checker {
  readonly checkType: string;
  run(ctx: ServerContext): Promise<CheckResult>;
}

// Helper: create a CheckResult easily
export function makeResult(
  checkType: string,
  severity: Severity,
  message: string,
  details?: Record<string, unknown>,
  startMs?: number,
): CheckResult {
  return {
    checkType,
    severity,
    message,
    details,
    durationMs: startMs !== undefined ? Date.now() - startMs : 0,
    checkedAt: new Date(),
  };
}
