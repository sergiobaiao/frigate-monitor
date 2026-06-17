// FrigateUbuntuChecker — RF-11
// SSH into Ubuntu server → run 'frigate-status.sh --json' + 'frigate-status.sh --check'
// Parses output; tolerates 'usage_percent: -' (→ CRITICAL)
// Constitution P3: read-only

import type { Checker, CheckResult, ServerContext } from './types';
import { SshClient } from '@/integrations/ssh';
import { SshError } from '@/integrations/ssh';
import { SeverityEngine } from './severity-engine';
import { makeResult } from './types';

const CHECK_TYPE = 'frigate_ubuntu';
const RAW_TRUNCATE = 2000;

type ExitCodeSeverity = 'ok' | 'warning' | 'critical';

function exitCodeToSeverity(code: number): ExitCodeSeverity {
  if (code === 0) return 'ok';
  if (code === 1) return 'warning';
  return 'critical';
}

function worstSeverity(
  a: 'ok' | 'warning' | 'critical',
  b: 'ok' | 'warning' | 'critical',
): 'ok' | 'warning' | 'critical' {
  if (a === 'critical' || b === 'critical') return 'critical';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'ok';
}

// Detects the invalid JSON pattern 'usage_percent: -' (bare minus, not quoted)
function hasMalformedUsagePct(raw: string): boolean {
  return /usage_percent["']?\s*:\s*-(?!\d)/.test(raw);
}

export class FrigateUbuntuChecker implements Checker {
  readonly checkType = CHECK_TYPE;

  async run(ctx: ServerContext): Promise<CheckResult> {
    const startMs = Date.now();

    const sshClient = new SshClient({
      host: ctx.host,
      port: ctx.sshPort,
      username: 'root',
      ...(ctx.secrets?.sshKey ? { privateKey: ctx.secrets.sshKey } : {}),
      ...(ctx.secrets?.sshPassword
        ? { password: ctx.secrets.sshPassword }
        : {}),
    });

    let jsonStdout: string;
    let checkExitCode: number;

    try {
      const jsonResult = await sshClient.exec('frigate-status.sh --json');
      jsonStdout = jsonResult.stdout;

      const checkResult = await sshClient.exec('frigate-status.sh --check');
      checkExitCode = checkResult.exitCode;
    } catch (err) {
      if (err instanceof SshError) {
        return makeResult(
          CHECK_TYPE,
          'unknown',
          'SSH connection failed',
          { error: err.message, code: err.code },
          startMs,
        );
      }
      throw err;
    }

    const rawJson = jsonStdout.slice(0, RAW_TRUNCATE);

    // Detect malformed output (invalid JSON pattern or actual parse failure)
    if (hasMalformedUsagePct(jsonStdout)) {
      return makeResult(
        CHECK_TYPE,
        'critical',
        'Frigate status output malformed or unavailable',
        { rawJson, exitCode: checkExitCode },
        startMs,
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStdout) as Record<string, unknown>;
    } catch {
      return makeResult(
        CHECK_TYPE,
        'critical',
        'Frigate status output malformed or unavailable',
        { rawJson, exitCode: checkExitCode },
        startMs,
      );
    }

    const frigateRunning = parsed['frigate_running'] !== false;

    const processSeverity = SeverityEngine.frigateProcess(frigateRunning);
    const scriptSeverity = exitCodeToSeverity(checkExitCode);

    // processSeverity is 'ok' | 'critical'; worstSeverity handles both
    const severity = worstSeverity(processSeverity, scriptSeverity);

    const message = frigateRunning
      ? severity === 'ok'
        ? 'Frigate running normally'
        : 'Frigate running but check script reported issues'
      : 'Frigate process is not running';

    return makeResult(
      CHECK_TYPE,
      severity,
      message,
      { frigateRunning, exitCode: checkExitCode, rawJson },
      startMs,
    );
  }
}
