// The two pure readings of a run's timings: the floor lanes could reach, and whether the table still tells
// the truth about what a step costs.
import { describe, expect, it } from 'vitest';
import { criticalPath, driftedSteps, outgrownRungs, willNotCache } from '../../../scripts/lib/step-timing.ts';
import { declaredShare, type TimeoutClass } from '../../../scripts/lib/step-timeouts.ts';
import type { SchedulableStep } from '../../../scripts/lib/chain-schedule.ts';

/** A pooled step, which `driftedSteps` treats like any other — the run decides what may be reported, not the step */
type TimedStep = SchedulableStep & { readonly forceArgs?: readonly string[]; readonly timeout?: TimeoutClass };

const step = (name: string, dependsOn: string[] = [], extra: Partial<TimedStep> = {}): TimedStep =>
  ({ name, dependsOn, ...extra });

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

  /**
   * The other end of the same rule, and the one that shipped reporting forever.
   *
   * `check:tiers` declares 0.3s. A 1s measurement is past twice that, so the report named it on every full
   * run — and `SECONDS_FLOOR` refuses to write a movement of a second or less, so "re-measure, or record"
   * could not be done. Three steps declare under a second, so this was not one step's quirk.
   */
  it('says nothing about a drift the record would refuse to write', () => {
    expect(driftedSteps([step('tiers', [], { seconds: 0.3 })], new Map([['tiers', 1_000]]))).toEqual([]);
  });

  it('still reports a sub-second declaration that moved further than the floor', () => {
    // Not over-broad: the guard is about the size of the movement, not about the size of the declaration,
    // and 0.3 -> 2 is a step that really has grown
    expect(driftedSteps([step('tiers', [], { seconds: 0.3 })], new Map([['tiers', 2_000]])))
      .toEqual([{ name: 'tiers', declared: 0.3, measured: 2 }]);
  });

  /**
   * The two pooled steps run only their stale projects, so an incremental run is normally well under half
   * the declared cost — which is the whole pool's. That fired the advisory on nearly every run, and a warning
   * that is always on is one nobody reads. `forceArgs` is the marker, because it already means the step keeps
   * a cache of its own.
   */
  describe('a step that keeps a cache of its own', () => {
    const pooled = [step('test:unit:host', [], { seconds: 20, forceArgs: ['--all'] })];

    /**
     * The `--all` gate that used to live here moved to `driftReport`, because it was never only about pooled
     * steps: measured, an incremental run left `typecheck` at 12s against a declared 27s, having run with
     * nine of twelve steps cached and so no contention. One gate on the run, rather than a flag per step.
     * `chain-output.spec.ts` holds it now.
     */
    it('is reported like any other step, the run being what decides whether to ask', () => {
      expect(driftedSteps(pooled, new Map([['test:unit:host', 5_000]])))
        .toEqual([{ name: 'test:unit:host', declared: 20, measured: 5 }]);
    });

    // The direction the kill budget cares about: at four times the declared cost, budgetFor starts killing
    it('is reported when it overran, not only when it undershot', () => {
      expect(driftedSteps(pooled, new Map([['test:unit:host', 50_000]])))
        .toEqual([{ name: 'test:unit:host', declared: 20, measured: 50 }]);
    });
  });

  it('says nothing about a step that did not run, or one that declares no measurement', () => {
    expect(driftedSteps(steps, new Map())).toEqual([]);
    expect(driftedSteps([step('undeclared')], new Map([['undeclared', 999_000]]))).toEqual([]);
  });
});

/**
 * Whether a step has outgrown its rung according to what it *cost*, rather than what it declares.
 *
 * **`declaredShare` is a bound on a declared number, and the only thing watching that number is a
 * half-to-double band — so the watcher is looser than the thing it protects.** Measured 2026-10-04:
 * `test:integration` declares 60s and sits at 0.80 of its `suite` rung, and could reach 120s before
 * `driftedSteps` says a word, which is 1.60 of the rung. Four steps can break the bound in silence. It is not
 * hypothetical either — that step measured 67.3s in a chain run the same day, 0.90 of its rung, while the
 * table reported 0.80.
 *
 * So the question is asked of the measurement, which is the move `criticalPath` already made in this file for
 * the same reason: its floor was reported from `seconds` and was wrong by the table's drift, 109s against the
 * 125.8s those steps actually took.
 */
describe('outgrownRungs', () => {
  const ran = (name: string, timeout: TimeoutClass, declared: number): TimedStep =>
    step(name, [], { seconds: declared, timeout });

  /** The case this exists for: the declaration passes the bound and the measurement does not */
  it('reports a step whose measured cost passes the rung its declared cost fits in', () => {
    // test:integration's own numbers: 60s declared is 0.80 of `suite`; 80s measured is 1.07
    const steps = [ran('test:integration', 'suite', 60)];
    const found = outgrownRungs(steps, new Map([['test:integration', 80_000]]));

    expect(found.map((row) => row.name)).toEqual(['test:integration']);
    expect(found[0], 'both numbers, since the gap is the finding').toMatchObject({
      declared: 60, measured: 80,
    });
    expect(found[0]!.at, 'and where the measurement lands on the rung').toBeCloseTo(1.07, 2);
  });

  it('says nothing about a step whose measured cost still fits', () => {
    // 67.3s is the real reading that prompted this, and it is inside the rung — 0.90, uncomfortable, not over
    expect(outgrownRungs([ran('test:integration', 'suite', 60)], new Map([['test:integration', 67_300]])))
      .toEqual([]);
  });

  it('says nothing about a step the run did not measure', () => {
    // A cached step cost no time, so it is evidence of nothing — the same reason `criticalPath` skips it
    expect(outgrownRungs([ran('compile', 'suite', 13)], new Map())).toEqual([]);
  });

  /**
   * A step already over on its *declaration* is `chain-graph.spec.ts`' business, not this report's.
   *
   * That spec fails the chain at `test:unit:host`, so a run reaching this report has a table that passes the
   * bound. Reporting it here too would say the same thing twice and in the weaker place.
   */
  it('leaves a declaration that is already over to the spec that gates on it', () => {
    const over = [ran('greedy', 'quick', 20)];
    expect(declaredShare(20, 'quick'), 'declared is already past the bound').toBeGreaterThan(1);
    expect(outgrownRungs(over, new Map([['greedy', 20_000]])), 'so this is not the thing to report it')
      .toEqual([]);
  });

  it('weighs each step against its own rung', () => {
    // 40s is over `quick` (2.67) and well inside `suite` (0.53) — the rung is the unit, not the number
    const found = outgrownRungs(
      [ran('leg', 'quick', 10), ran('pool', 'suite', 40)],
      new Map([['leg', 40_000], ['pool', 40_000]]),
    );
    expect(found.map((row) => row.name)).toEqual(['leg']);
  });
});

describe('willNotCache', () => {
  const steps = [{ name: 'a' }, { name: 'b' }, { name: 'e2e', neverCachedBecause: 'it drives real Electron' }];
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
