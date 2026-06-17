import { describe, it, expect } from 'vitest';
import { SeverityEngine } from './severity-engine';
import type { ServerContext } from './types';

const noThresholds: ServerContext['thresholds'] = {};

// ─── Disk ───────────────────────────────────────────────────────────────────

describe('SeverityEngine.disk', () => {
  it('ok at 30% used, 70% free', () => {
    expect(
      SeverityEngine.disk({ usedPct: 30, freePct: 70 }, noThresholds),
    ).toBe('ok');
  });

  it('warning at 80% used (≥warnPct=75, <critPct=90)', () => {
    expect(
      SeverityEngine.disk({ usedPct: 80, freePct: 20 }, noThresholds),
    ).toBe('warning');
  });

  it('critical at 92% used (≥critPct=90)', () => {
    expect(SeverityEngine.disk({ usedPct: 92, freePct: 8 }, noThresholds)).toBe(
      'critical',
    );
  });

  it('critical when freePct < minFreePct=15 (even if usedPct is modest)', () => {
    expect(SeverityEngine.disk({ usedPct: 50, freePct: 5 }, noThresholds)).toBe(
      'critical',
    );
  });

  it('critical at emergencyPct (96% used)', () => {
    expect(SeverityEngine.disk({ usedPct: 96, freePct: 4 }, noThresholds)).toBe(
      'critical',
    );
  });

  it('critical exactly at emergencyPct boundary (95%)', () => {
    expect(SeverityEngine.disk({ usedPct: 95, freePct: 5 }, noThresholds)).toBe(
      'critical',
    );
  });

  it('warning exactly at warnPct boundary (75%)', () => {
    expect(
      SeverityEngine.disk({ usedPct: 75, freePct: 25 }, noThresholds),
    ).toBe('warning');
  });

  it('ok just below warnPct (74%)', () => {
    expect(
      SeverityEngine.disk({ usedPct: 74, freePct: 26 }, noThresholds),
    ).toBe('ok');
  });

  it('custom thresholds: warnPct=60 triggers warning at 65%', () => {
    expect(
      SeverityEngine.disk(
        { usedPct: 65, freePct: 35 },
        { warnPct: 60, critPct: 80 },
      ),
    ).toBe('warning');
  });

  it('custom thresholds: minFreePct=20 triggers critical when freePct=18', () => {
    expect(
      SeverityEngine.disk({ usedPct: 70, freePct: 18 }, { minFreePct: 20 }),
    ).toBe('critical');
  });

  it('critical exactly at critPct boundary (90%)', () => {
    expect(
      SeverityEngine.disk({ usedPct: 90, freePct: 10 }, noThresholds),
    ).toBe('critical');
  });

  it('freePct exactly at minFreePct boundary (15%) is ok, not critical', () => {
    // freePct=15 is NOT < 15, so minFreePct threshold not triggered; usedPct=60 < warnPct=75 → ok
    expect(
      SeverityEngine.disk({ usedPct: 60, freePct: 15 }, noThresholds),
    ).toBe('ok');
  });
});

// ─── Camera ─────────────────────────────────────────────────────────────────

describe('SeverityEngine.camera', () => {
  it('ok when fps > 0 and stale intervals below threshold', () => {
    expect(
      SeverityEngine.camera(
        { fps: 15, lastFrameAgeSec: 1, staleFrameIntervals: 0 },
        noThresholds,
      ),
    ).toBe('ok');
  });

  it('critical when fps === 0', () => {
    expect(
      SeverityEngine.camera(
        { fps: 0, lastFrameAgeSec: 60, staleFrameIntervals: 5 },
        noThresholds,
      ),
    ).toBe('critical');
  });

  it('warning when staleFrameIntervals >= default threshold (3)', () => {
    expect(
      SeverityEngine.camera(
        { fps: 5, lastFrameAgeSec: 10, staleFrameIntervals: 3 },
        noThresholds,
      ),
    ).toBe('warning');
  });

  it('warning when staleFrameIntervals exceeds default threshold (5 >= 3)', () => {
    expect(
      SeverityEngine.camera(
        { fps: 1, lastFrameAgeSec: 30, staleFrameIntervals: 5 },
        noThresholds,
      ),
    ).toBe('warning');
  });

  it('custom staleFrameIntervals=2: warning at 2', () => {
    expect(
      SeverityEngine.camera(
        { fps: 10, lastFrameAgeSec: 5, staleFrameIntervals: 2 },
        { staleFrameIntervals: 2 },
      ),
    ).toBe('warning');
  });

  it('custom staleFrameIntervals=2: ok at 1', () => {
    expect(
      SeverityEngine.camera(
        { fps: 10, lastFrameAgeSec: 2, staleFrameIntervals: 1 },
        { staleFrameIntervals: 2 },
      ),
    ).toBe('ok');
  });
});

// ─── Recording ──────────────────────────────────────────────────────────────

describe('SeverityEngine.recording', () => {
  it('ok when has recordings and retentionDays >= minRetentionDays', () => {
    expect(
      SeverityEngine.recording(
        { hasRecordings: true, retentionDays: 7 },
        noThresholds,
      ),
    ).toBe('ok');
  });

  it('critical when no recordings', () => {
    expect(
      SeverityEngine.recording(
        { hasRecordings: false, retentionDays: 0 },
        noThresholds,
      ),
    ).toBe('critical');
  });

  it('warning when retentionDays < minRetentionDays default (1)', () => {
    expect(
      SeverityEngine.recording(
        { hasRecordings: true, retentionDays: 0 },
        noThresholds,
      ),
    ).toBe('warning');
  });

  it('custom minRetentionDays=3: warning at 2 days', () => {
    expect(
      SeverityEngine.recording(
        { hasRecordings: true, retentionDays: 2 },
        { minRetentionDays: 3 },
      ),
    ).toBe('warning');
  });

  it('custom minRetentionDays=3: ok at 3 days', () => {
    expect(
      SeverityEngine.recording(
        { hasRecordings: true, retentionDays: 3 },
        { minRetentionDays: 3 },
      ),
    ).toBe('ok');
  });
});

// ─── StorageMount ────────────────────────────────────────────────────────────

describe('SeverityEngine.storageMount', () => {
  it('ok when state is active', () => {
    expect(SeverityEngine.storageMount({ state: 'active' }, noThresholds)).toBe(
      'ok',
    );
  });

  it('critical when state is failed', () => {
    expect(SeverityEngine.storageMount({ state: 'failed' }, noThresholds)).toBe(
      'critical',
    );
  });

  it('warning when state is unknown', () => {
    expect(
      SeverityEngine.storageMount({ state: 'unknown' }, noThresholds),
    ).toBe('warning');
  });

  it('active with optional usedPct still ok', () => {
    expect(
      SeverityEngine.storageMount(
        { state: 'active', usedPct: 50 },
        noThresholds,
      ),
    ).toBe('ok');
  });
});

// ─── FrigateProcess ──────────────────────────────────────────────────────────

describe('SeverityEngine.frigateProcess', () => {
  it('ok when running', () => {
    expect(SeverityEngine.frigateProcess(true)).toBe('ok');
  });

  it('critical when not running', () => {
    expect(SeverityEngine.frigateProcess(false)).toBe('critical');
  });
});
