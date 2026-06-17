import { describe, it, expect } from 'vitest';
import {
  UnknownEscalation,
  DEFAULT_ESCALATION_THRESHOLD,
} from './unknown-escalation';

describe('UnknownEscalation.shouldEscalate', () => {
  it('returns false when count is below default threshold', () => {
    expect(UnknownEscalation.shouldEscalate(4)).toBe(false);
  });

  it('returns true when count equals default threshold', () => {
    expect(UnknownEscalation.shouldEscalate(5)).toBe(true);
  });

  it('returns true when count is above default threshold', () => {
    expect(UnknownEscalation.shouldEscalate(10)).toBe(true);
  });

  it('returns true with custom threshold when count reaches it', () => {
    expect(UnknownEscalation.shouldEscalate(5, 3)).toBe(true);
  });

  it('returns false with custom threshold when count is below it', () => {
    expect(UnknownEscalation.shouldEscalate(2, 3)).toBe(false);
  });
});

describe('UnknownEscalation.getEscalatedSeverity', () => {
  it('returns unknown when below threshold', () => {
    expect(UnknownEscalation.getEscalatedSeverity('unknown', 4)).toBe(
      'unknown',
    );
  });

  it('returns critical when at threshold', () => {
    expect(
      UnknownEscalation.getEscalatedSeverity(
        'unknown',
        DEFAULT_ESCALATION_THRESHOLD,
      ),
    ).toBe('critical');
  });
});

describe('UnknownEscalation.incrementCount', () => {
  it('increments count by 1', () => {
    expect(UnknownEscalation.incrementCount(3)).toBe(4);
  });
});

describe('UnknownEscalation.resetCount', () => {
  it('returns 0', () => {
    expect(UnknownEscalation.resetCount()).toBe(0);
  });
});
