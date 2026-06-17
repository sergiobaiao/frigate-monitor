// SeverityEngine: maps raw metric values to Severity levels
// All thresholds use ctx.thresholds with fallbacks to defaults
// Constitution P7: ≥90% coverage on all rules (complex business logic)

import type { ServerContext } from './types';

export interface DiskMetrics {
  usedPct: number; // 0-100
  freePct: number; // 0-100
}

export interface CameraMetrics {
  fps: number;
  lastFrameAgeSec: number;
  staleFrameIntervals: number; // how many check intervals since last frame
}

export interface RecordingMetrics {
  retentionDays: number; // oldest recording age in days
  hasRecordings: boolean;
}

export interface StorageMountMetrics {
  state: 'active' | 'failed' | 'unknown';
  usedPct?: number; // optional — not all mounts report usage
}

export const SeverityEngine = {
  disk(
    metrics: DiskMetrics,
    thresholds: ServerContext['thresholds'],
  ): 'ok' | 'warning' | 'critical' {
    const warnPct = thresholds.warnPct ?? 75;
    const critPct = thresholds.critPct ?? 90;
    const emergencyPct = thresholds.emergencyPct ?? 95;
    const minFreePct = thresholds.minFreePct ?? 15;

    if (metrics.usedPct >= emergencyPct || metrics.freePct < minFreePct) {
      return 'critical';
    }
    if (metrics.usedPct >= critPct) {
      return 'critical';
    }
    if (metrics.usedPct >= warnPct) {
      return 'warning';
    }
    return 'ok';
  },

  camera(
    metrics: CameraMetrics,
    thresholds: ServerContext['thresholds'],
  ): 'ok' | 'warning' | 'critical' {
    const staleThreshold = thresholds.staleFrameIntervals ?? 3;

    if (metrics.fps === 0) {
      return 'critical';
    }
    if (metrics.staleFrameIntervals >= staleThreshold) {
      return 'warning';
    }
    return 'ok';
  },

  recording(
    metrics: RecordingMetrics,
    thresholds: ServerContext['thresholds'],
  ): 'ok' | 'warning' | 'critical' {
    const minRetentionDays = thresholds.minRetentionDays ?? 1;

    if (!metrics.hasRecordings) {
      return 'critical';
    }
    if (metrics.retentionDays < minRetentionDays) {
      return 'warning';
    }
    return 'ok';
  },

  storageMount(
    metrics: StorageMountMetrics,
    _thresholds: ServerContext['thresholds'],
  ): 'ok' | 'warning' | 'critical' {
    if (metrics.state === 'failed') return 'critical';
    if (metrics.state === 'unknown') return 'warning';
    return 'ok';
  },

  frigateProcess(running: boolean): 'ok' | 'critical' {
    return running ? 'ok' : 'critical';
  },
};
