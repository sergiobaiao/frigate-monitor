import type { Checker } from './types';

// Simple registry: map of checkType → Checker
// Used by the scheduler to run all enabled checkers for a server

export class CheckerRegistry {
  private readonly checkers = new Map<string, Checker>();

  register(checker: Checker): void {
    // throw if already registered — prevent accidental double-register
    if (this.checkers.has(checker.checkType)) {
      throw new Error(`Checker already registered: ${checker.checkType}`);
    }
    this.checkers.set(checker.checkType, checker);
  }

  get(checkType: string): Checker {
    const c = this.checkers.get(checkType);
    if (!c) throw new Error(`Checker not found: ${checkType}`);
    return c;
  }

  getAll(): Checker[] {
    return [...this.checkers.values()];
  }

  // For tests / cleanup
  clear(): void {
    this.checkers.clear();
  }
}

export const checkerRegistry = new CheckerRegistry();
