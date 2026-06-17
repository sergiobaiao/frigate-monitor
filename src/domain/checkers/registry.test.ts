import { describe, it, expect, beforeEach } from 'vitest';
import { CheckerRegistry } from './registry';
import type { Checker, CheckResult, ServerContext } from './types';

function makeChecker(checkType: string): Checker {
  return {
    checkType,
    run: (_ctx: ServerContext): Promise<CheckResult> => {
      throw new Error('not implemented');
    },
  };
}

describe('CheckerRegistry', () => {
  let registry: CheckerRegistry;

  beforeEach(() => {
    registry = new CheckerRegistry();
  });

  it('register() adds checker, getAll() returns it', () => {
    const checker = makeChecker('connectivity');
    registry.register(checker);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]).toBe(checker);
  });

  it('get() returns registered checker', () => {
    const checker = makeChecker('disk');
    registry.register(checker);
    expect(registry.get('disk')).toBe(checker);
  });

  it('get() throws for unknown checkType', () => {
    expect(() => registry.get('nonexistent')).toThrow(
      'Checker not found: nonexistent',
    );
  });

  it('register() throws for duplicate checkType', () => {
    registry.register(makeChecker('connectivity'));
    expect(() => registry.register(makeChecker('connectivity'))).toThrow(
      'Checker already registered: connectivity',
    );
  });

  it('clear() empties the registry', () => {
    registry.register(makeChecker('connectivity'));
    registry.register(makeChecker('disk'));
    expect(registry.getAll()).toHaveLength(2);
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});
