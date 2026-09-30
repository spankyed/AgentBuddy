import { describe, expect, it } from 'vitest';
import {
  citation, cpuTimes, driftedDuring, groupBySignature, idleFrom, IDLE_FLOOR, pairedDelta, rateOf,
  refusesAsBusy, runOrder, signatureOf, summarise, upperBound,
} from '../../../scripts/lib/measure.ts';

/**
 * What `npm run measure` decides, asserted without timing anything.
 *
 * The tool exists because five numbers in `goal-integration-pool` were wrong and three reached commit
 * messages — every one from a hand-rolled loop with no idle gate and no repetition. So the decisions it
 * makes are the subject here: when to refuse, what a series says, and how a number is quoted.
 */

const times = (idle: number, user: number) => [{ times: { user, nice: 0, sys: 0, idle, irq: 0 } }];

describe('how idle the machine is', () => {
  it('reads the fraction from two snapshots', () => {
    expect(idleFrom(cpuTimes(times(0, 0)), cpuTimes(times(750, 250)))).toBeCloseTo(0.75, 5);
  });

  it('sums across cores rather than reading one', () => {
    const two = [...times(300, 100), ...times(700, 900)];
    expect(cpuTimes(two)).toEqual({ idle: 1000, total: 2000 });
  });

  /**
   * The field list is the data's, not ours. A hardcoded set of CPU states is a restated population, and the
   * check that closed the previous session was blind to nine of twelve files for exactly that: it named
   * what to look for instead of reading it. A platform reporting a state we have not heard of must still
   * land in the total, or every idle fraction is quietly overstated.
   */
  it('counts a CPU state it has never heard of', () => {
    const exotic = [{ times: { user: 100, sys: 0, idle: 100, steal: 800 } }];
    expect(cpuTimes(exotic), 'steal is busy time and belongs in the total').toEqual({ idle: 100, total: 1000 });
  });

  /**
   * The bug this whole design is shaped around. A `top` parse returned 0% for a line it could not read, so
   * a gate waiting for the box to go quiet waited for ever and looked like patience. An unreadable sample
   * is a broken measurement, not a low one.
   */
  it('throws on a sample that did not advance, rather than reporting 0%', () => {
    const same = cpuTimes(times(500, 500));
    expect(() => idleFrom(same, same)).toThrow(/did not advance.*reading is broken, not low/s);
  });

  it('throws on counters that went backwards, which is the same kind of nonsense', () => {
    expect(() => idleFrom(cpuTimes(times(900, 100)), cpuTimes(times(100, 900)))).toThrow(/did not advance/);
  });
});

describe('when a measurement is refused', () => {
  const busy = { idle: 0.2, floor: IDLE_FLOOR, force: false };

  it('refuses below the floor, which is what the tool is for', () => {
    expect(refusesAsBusy(busy)).toBe(true);
  });

  it('allows a quiet box', () => {
    expect(refusesAsBusy({ ...busy, idle: 0.95 })).toBe(false);
  });

  // An override, not an obstacle: a floor people cannot pass is a floor they stop running the tool over
  it('is suppressed by --force', () => {
    expect(refusesAsBusy({ ...busy, force: true })).toBe(false);
  });

  it('takes the floor it is given, so a deliberate lower bar is possible', () => {
    expect(refusesAsBusy({ ...busy, floor: 0.1 })).toBe(false);
  });

  // Reported, not fatal: the run produced numbers, and hiding the drift inside a clean median is how a
  // contended arm gets compared against a quiet one
  it('reports drift separately from refusing to start', () => {
    expect(driftedDuring([0.9, 0.9, 0.3], IDLE_FLOOR)).toBe(true);
    expect(driftedDuring([0.9, 0.85], IDLE_FLOOR)).toBe(false);
  });
});

describe('what a series says', () => {
  it('takes the middle of an odd series and the mean of the two middles of an even one', () => {
    expect(summarise([30, 10, 20])).toMatchObject({ median: 20, min: 10, max: 30, runs: 3 });
    expect(summarise([10, 20, 30, 40]).median).toBe(25);
  });

  it('refuses to summarise nothing rather than inventing a number', () => {
    expect(() => summarise([])).toThrow(/not a measurement/);
  });

  /**
   * Interleaved, never blocked. Running all of A then all of B lets a drifting box into the answer, which
   * is what turned a 49.1s→48.2s difference into a reported 71s→46.1s one.
   */
  it('alternates the arms so each pair shares its conditions', () => {
    expect(runOrder(3, true)).toEqual(['a', 'b', 'a', 'b', 'a', 'b']);
    expect(runOrder(3, false)).toEqual(['a', 'a', 'a']);
  });

  // The median of the pairs, not the difference of the medians — pairing is the whole reason for the order
  it('pairs the arms rather than comparing two medians', () => {
    expect(pairedDelta([100, 200, 300], [110, 260, 330])).toMatchObject({ ms: 30 });
    expect(pairedDelta([100, 100], [150, 150]).fraction).toBeCloseTo(0.5, 5);
  });

  it('refuses arms of different lengths, which cannot be paired', () => {
    expect(() => pairedDelta([1, 2], [1])).toThrow(/equal runs/);
  });
});

describe('what a number is quoted as', () => {
  const summary = summarise([45_000, 48_000, 49_000]);
  const base = { summary, idle: 0.92, on: '2026-09-29', forced: false, drifted: false };

  // A number without its conditions is an assertion; with them it is a citation, and the difference is
  // three of this repo's commit messages
  it('carries the spread, the conditions and the date', () => {
    expect(citation(base)).toBe('48.0s median of 3 (45.0s-49.0s), 92% idle, 2026-09-29');
  });

  it('says so when the floor was forced', () => {
    expect(citation({ ...base, forced: true })).toContain('forced');
  });

  it('says so when conditions moved', () => {
    expect(citation({ ...base, drifted: true })).toContain('drifted');
  });

  it('drops the range when every run agreed', () => {
    expect(citation({ ...base, summary: summarise([1000]) })).toBe('1.0s median of 1, 92% idle, 2026-09-29');
  });
});

/**
 * What makes two failures the same failure, and what a run of trials licenses you to say.
 *
 * The birpc timeout these exist for had only ever been seen by accident, so its whole evidence base was one
 * failure in two runs. A rate needs trials; a *useful* rate needs the failures told apart.
 */
describe('counting failures rather than timing successes', () => {
  const birpc = (at: string, line: number) => ({
    code: 1,
    stderr: `Error: [vitest-worker]: Timeout calling "onTaskUpdate"\n at Object.onTimeoutError ${at}/rpc.js:${line}:10`,
  });
  const assertion = { code: 1, stderr: 'AssertionError: expected 1 to be 2\n at tests/a.spec.ts:12:3' };

  // The same failure on two machines, or two line numbers apart, is one failure
  it('groups a failure across the tokens that vary between runs', () => {
    expect(signatureOf(birpc('/Users/a/node_modules/vitest', 53)))
      .toBe(signatureOf(birpc('/Users/b/other/vitest', 991)));
  });

  it('keeps distinct failures distinct', () => {
    expect(signatureOf(birpc('/x', 1))).not.toBe(signatureOf(assertion));
  });

  /**
   * The exit code is part of it, and exactly — a command killed by a timeout and one that failed an
   * assertion can print the same tail, and calling those one failure hides the interesting half.
   */
  it('separates two failures that said the same thing and exited differently', () => {
    expect(signatureOf({ code: 1, stderr: 'boom' })).not.toBe(signatureOf({ code: 137, stderr: 'boom' }));
  });

  it('gives a pass no signature, because grouping successes says only that they succeeded', () => {
    expect(signatureOf({ code: 0, stderr: '' })).toBe('');
  });

  it('counts each group and keeps one example verbatim', () => {
    const groups = groupBySignature([
      { ms: 1, ...birpc('/a', 1) }, { ms: 1, ...birpc('/b', 2) }, { ms: 1, ...assertion },
      { ms: 1, code: 0, stderr: '' },
    ]);
    expect(groups.map((g) => g.count), 'commonest first').toEqual([2, 1]);
    // Normalised for grouping, verbatim for reading: the grouping is a convenience, the text is the evidence
    expect(groups[0]!.signature).toContain('rpc.js:N:N');
    expect(groups[0]!.exemplar).toContain('rpc.js:1:10');
  });

  it('reads a rate over the trials, passes included', () => {
    expect(rateOf([{ ms: 1, code: 1, stderr: '' }, { ms: 1, code: 0, stderr: '' }])).toBe(0.5);
  });

  /**
   * What clean runs actually license. Five bound the rate at 45% and twenty at 14% — arithmetic that
   * decided whether to lift the integration pool's worker cap, done by hand in a chat message. A tool that
   * leaves the reader to do it will have readers who quote "five clean runs" as proof.
   */
  it('bounds the rate rather than reporting zero for a clean run', () => {
    expect(upperBound(0, 5)).toBeCloseTo(0.451, 2);
    expect(upperBound(0, 20)).toBeCloseTo(0.139, 2);
    expect(upperBound(0, 5), 'never the observed rate, which is what makes it a bound').toBeGreaterThan(0);
  });

  it('widens with observed failures and never exceeds certainty', () => {
    expect(upperBound(3, 20)).toBeGreaterThan(3 / 20);
    expect(upperBound(5, 5)).toBeLessThanOrEqual(1);
  });

  it('refuses a bound over no trials', () => {
    expect(() => upperBound(0, 0)).toThrow(/not a bound/);
  });
});
