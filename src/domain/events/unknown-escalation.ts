// RN-05: After N consecutive UNKNOWN results for same dedupeKey,
// treat as CRITICAL (infrastructure problem, not transient).
// N = configurable via UNKNOWN_ESCALATION_THRESHOLD (default: 5).
// Escalation count is NOT persisted here — callers use the `occurences`
// field on open 'unknown' Events from EventService.

export const DEFAULT_ESCALATION_THRESHOLD = 5;

export interface EscalationState {
  unknownCount: number;
  lastSeenAt: Date;
}

export const UnknownEscalation = {
  shouldEscalate(
    unknownCount: number,
    threshold: number = DEFAULT_ESCALATION_THRESHOLD,
  ): boolean {
    return unknownCount >= threshold;
  },

  getEscalatedSeverity(
    severity: 'unknown',
    unknownCount: number,
    threshold?: number,
  ): 'unknown' | 'critical' {
    return UnknownEscalation.shouldEscalate(unknownCount, threshold)
      ? 'critical'
      : severity;
  },

  incrementCount(current: number): number {
    return current + 1;
  },

  resetCount(): number {
    return 0;
  },
};
