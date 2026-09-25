// The two pure readings of a run's timings: the floor lanes could reach, and whether the table still tells
// the truth about what a step costs.
import { describe, expect, it } from 'vitest';
import { criticalPath, driftedSteps, willNotCache } from '../../../../scripts/lib/step-timing.ts';
import type { SchedulableStep } from '../../../../scripts/lib/chain-schedule.ts';

const step = (name: string, needs: string[] = [], extra: Partial<SchedulableStep> = {}): SchedulableStep =>
  ({ name, needs, ...extra });

describe('criticalPath', () => {
  it('is the longest path by seconds, not the longest by step count', () => {
    const steps = [
      step('a', [], { seconds: 1 }),
      step('short', ['a'], { seconds: 50 }),
      step('one', ['a'], { seconds: 2 }),
      step('two', ['one'], { seconds: 2 }),
      step('three', ['two'], { seconds: 2 }),
    ];
    expect(criticalPath(steps)).toEqual({ names: ['a', 'short'], seconds: 51 });
  });

  it('ignores a need that is not in the set, so a cached step costs nothing', () => {
    // `b` needs `a`, but only `b` ran — the answer is b alone, not a crash
    expect(criticalPath([step('b', ['a'], { seconds: 4 })])).toEqual({ names: ['b'], seconds: 4 });
  });

  it('counts a step with no measurement as free rather than dropping the path', () => {
    expect(criticalPath([step('a', [], {}), step('b', ['a'], { seconds: 3 })])).toEqual({ names: ['a', 'b'], seconds: 3 });
  });
});

describe('driftedSteps', () => {
  const steps = [step('slow', [], { seconds: 10 }), step('fast', [], { seconds: 10 }), step('right', [], { seconds: 10 })];

  it('reports a step that now costs more than twice what it claims', () => {
    expect(driftedSteps(steps, new Map([['slow', 21_000]]))).toEqual([{ name: 'slow', declared: 10, measured: 21 }]);
  });

  it('reports one that claims far more than it costs, since that inflates the critical path', () => {
    expect(driftedSteps(steps, new Map([['fast', 4_000]]))).toEqual([{ name: 'fast', declared: 10, measured: 4 }]);
  });

  // Wide on purpose: lanes, a warm cache and a loaded machine move a step a long way, and a warning that
  // fires on ordinary variance is one people learn to skip
  it('says nothing about ordinary variance inside the band', () => {
    expect(driftedSteps(steps, new Map([['right', 19_000]]))).toEqual([]);
    expect(driftedSteps(steps, new Map([['right', 5_000]]))).toEqual([]);
  });

  // `seconds` is what a step costs when it does its work, and a step can run having nothing to do:
  // packages:ensure returns in 0.4s with the packages already fresh. Reporting that told the first run of
  // this check to record `seconds: 14 -> 0`, the cached cost.
  it('says nothing about a step that finished in under a second, which may have had nothing to do', () => {
    expect(driftedSteps([step('ensure', [], { seconds: 14 })], new Map([['ensure', 400]]))).toEqual([]);
  });

  it('says nothing about a step that did not run, or one that declares no measurement', () => {
    expect(driftedSteps(steps, new Map())).toEqual([]);
    expect(driftedSteps([step('undeclared')], new Map([['undeclared', 999_000]]))).toEqual([]);
  });
});

describe('willNotCache', () => {
  const steps = [{ name: 'a' }, { name: 'b' }, { name: 'e2e', cache: false as const }];
  const passed = new Set(['a', 'b', 'e2e']);

  it('names a step that passed and is already stale again', () => {
    expect(willNotCache(steps, passed, (s) => (s.name === 'b' ? 'its inputs changed since the last successful run' : null)))
      .toEqual([{ name: 'b', reason: 'its inputs changed since the last successful run' }]);
  });

  it('says nothing when every step stayed fresh', () => {
    expect(willNotCache(steps, passed, () => null)).toEqual([]);
  });

  // A step that opts out of caching has no stamp to contradict, so its fingerprint moving means nothing
  it('ignores a step that is never cached', () => {
    expect(willNotCache(steps, passed, (s) => (s.name === 'e2e' ? 'stale' : null))).toEqual([]);
  });

  // A failed step writes no stamp on purpose, so of course it reads as stale; saying so would be noise
  it('ignores a step that did not pass, whose stamp was deliberately not written', () => {
    expect(willNotCache(steps, new Set<string>(), () => 'stale')).toEqual([]);
    expect(willNotCache(steps, new Set(['a']), () => 'stale')).toEqual([{ name: 'a', reason: 'stale' }]);
  });
});
