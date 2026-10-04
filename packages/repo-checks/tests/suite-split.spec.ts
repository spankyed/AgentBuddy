// Which half a spec runs in is decided by what it costs, recorded in `etc/spec-cost.json`.
//
// It used to be decided by whether the spec's imports reached `node:child_process`. That was a good proxy
// for "slow" only while spawning was the only way to be slow, and three counter-examples ended it: a helper
// that reaches esbuild — which spawns — while reading as clean; a 48s spec with no spawn sites at all,
// filed correctly only because line 1 still imported `execFileSync`; and a 20ms spec filed as spawning
// because the export it imports defaults to `spawnSync`. Mechanism said all three wrongly.
//
// This reads the record and runs nothing. Re-measuring here would make the cheap half expensive, which is
// the thing the split exists to prevent, so `npm run spec-cost:update -w @abuddy/cli` is the deliberate act
// and this is the guard that it was done.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import {
  FAST_BELOW_MS, INTEGRATION_ABOVE_MS, SPEC_COST_FLAGS, absentIn, changesIn,
  absentNamed, CONTENTION_RATIO_MAX, COST_ACCURACY, describeBudget, EXPENSIVE_BY_NATURE, halfFor,
  halfOfPath, hasSplit, disagrees, nearEdge, worthKeeping, ratiosFromMoves, towardEdge, underBound, type SpecCost,
  namedIn, overBudget, parseArgs,
  planFor, readSpecCost,
  recordMembership, refuseAbsent, forgetsWindows, settle, specCostFile, specFiles, stale, suitesFor,
  writesMembershipOnly,
  unrecorded, WINDOW, appendSample, costOf, provisional, withCosts,
} from '../../../scripts/lib/spec-cost.ts';
// The sample-recording primitives, shared with the chain's own cost table since 2026-10-02. The cases below
// stay here rather than moving to `measure.spec.ts` with them, because what they check is these functions as
// *this* record uses them — the body-drift case asserts `moved` says nothing about the same numbers, which is
// the whole point of having both, and that pairing only exists here.
//
// A record is built from `windows` below rather than written as a cost map: a cost is derived from a
// window now, so a fixture that set one would be setting a field nothing reads.
import { bodyDrift, contended, drifted, refusesAsContended } from '../../../scripts/lib/measure.ts';
import { isMeasuredMachine, machineText, thisMachine } from '../../../scripts/lib/core-budget.ts';
import { priceSpecs } from '../../../scripts/lib/spec-dry.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

/** Every suite's record, read once. A suite with no record is a failure below, not an empty pass. */
const suites = UNIT_SUITES.map((suite) => {
  const dir = path.join(REPO_ROOT, 'packages', suite.dir);
  return { suite, dir, record: readSpecCost(REPO_ROOT, suite.dir), files: specFiles(dir) };
});

describe('every suite records what its specs cost', () => {
  it.each(suites.map(({ suite }) => suite.dir))('%s has a record', (dir) => {
    const found = suites.find((candidate) => candidate.suite.dir === dir)!;
    expect(found.record, `no record for ${dir}; run: npm run spec-cost:update`).toBeDefined();
  });

  it('records every spec, so a new one cannot be placed by accident', () => {
    const missing = suites.flatMap(({ suite, record, files }) => (record ? unrecorded(record, files).map((f) => `${suite.dir}/${f}`) : []));
    expect(missing, 'run: npm run spec-cost:update').toEqual([]);
  });

  it('records no spec that has gone', () => {
    const gone = suites.flatMap(({ suite, record, files }) => (record ? stale(record, files).map((f) => `${suite.dir}/${f}`) : []));
    expect(gone, 'run: npm run spec-cost:update').toEqual([]);
  });
});

/**
 * Whether this is the machine the records were measured on.
 *
 * **The half-split is correctly machine-specific, and that is why these cases are scoped rather than made
 * portable.** A cost in milliseconds says where a spec belongs only against edges chosen for one machine's
 * speed; on a box three times slower, 32 of the 363 fast-half specs cross the 2 500ms edge and the check
 * fails for a tree nobody has touched. The machine is `MEASURED_ON` — the CPU as well as the core count,
 * because a core count alone called every 10-core box the measured one.
 *
 * **A ratio does not fix it, measured 2026-10-03.** `repo-checks` is not separable by one: four fast specs
 * cost more than its three cheapest integration specs, so the halves overlap at 9.4x the median against
 * 7.3x, and today's record survives because of the dead band rather than because the halves separate. The
 * nine single-half suites have medians of 6-168ms, so any ratio wide enough for the split suites is a far
 * lower absolute bar there — today's six `outgrown` findings would become 42. And `outgrown` is not a
 * placement question at all: it is a ceiling on what a fast half may cost, which is a policy about loop
 * time. `goal-measured-placement.md` already has the general form — *"a bound is not a fit; deriving one
 * from the measurement it bounds is how a timeout stops catching anything"* — and a median is a fit.
 *
 * So the cases that read the live record skip off this machine, with this as the reason, after
 * `packagesBuiltOrRefuse()`: evidence that does not apply is skipped rather than passed over. The pure
 * cases over synthetic costs run everywhere, because they are about the arithmetic and not about a box.
 */
/**
 * Each record names the machine it was measured on, so the question is asked of the records and not of the
 * chain's `MEASURED_ON` — which describes the box the chain's *seconds* were taken on. Two records, two
 * machines, and nothing made them the same box; scoping these cases on that constant was scoping on a fact
 * about something else.
 */
const MEASURED_BY = [...new Set(suites.flatMap(({ record }) => (record ? [machineText(record.machine)] : [])))];
const ON_MEASURED_MACHINE = suites.every(({ record }) => record === undefined || isMeasuredMachine(record.machine));
/** Appended to a skipped name, so a run on another machine says why rather than quietly reporting fewer cases */
const OFF_BOX = ON_MEASURED_MACHINE ? ''
  : ` — skipped: these costs were measured on ${MEASURED_BY.join(', ')} and this is ${machineText(thisMachine())}`;

/**
 * What a machine that is not the record's may write, which is membership and never a cost.
 *
 * A record holds two kinds of thing and they need different permissions: *which specs exist* is a fact about
 * the repo, and *what one costs* is a fact about a machine. They were one map until 2026-10-03, so adding a
 * spec meant measuring it — and the three cases above, which fail on any machine and each say *"run
 * spec-cost:update"*, sent a second developer down the one path that writes their box's milliseconds into a
 * record measured on someone else's. Nothing in the file said it then held two machines' numbers.
 *
 * These run everywhere, because they are about the arithmetic of the two lists and not about a box.
 */
/** One reading per spec, which is the shape a record migrated off point estimates has */
const windows = (costs: Record<string, number>): Record<string, readonly number[]> =>
  Object.fromEntries(Object.entries(costs).map(([spec, ms]) => [spec, [ms]]));

describe('a record anyone can add a spec to', () => {
  const OTHER = { cpu: 'Some Other CPU', cores: 4 };
  const base = (costs: Record<string, number>, unmeasured: string[] = []): SpecCost =>
    withCosts({ measuredAt: 'then', samples: windows(costs), skipped: [], unmeasured, machine: OTHER });

  it('lists a spec that has appeared, with no cost claimed for it', () => {
    const next = recordMembership(base({ 'tests/a.spec.ts': 100 }), ['tests/a.spec.ts', 'tests/b.spec.ts']);

    expect(next.unmeasured).toEqual(['tests/b.spec.ts']);
    expect(next.costs, 'a cost is a fact about a machine, so another machine may not write one')
      .toEqual({ 'tests/a.spec.ts': 100 });
    expect(next.machine, 'nor may it claim the record').toEqual(OTHER);
  });

  /**
   * The same question the command asks *before* deciding whether the machine has to be quiet.
   *
   * It asked only whether there was work to do, so the busy-machine refusal ran first and
   * unconditionally — and a suite on this branch takes no reading at all, so that refused a second
   * developer's spec addition over a sample that was never going to be taken. One rule, two readers: the
   * idle gate and the branch below.
   */
  describe('whether a suite measures at all', () => {
    const HERE = thisMachine();

    it('writes membership only when the record is another machine, so nothing is measured', () => {
      expect(writesMembershipOnly(base({}), false)).toBe(true);
    });

    it('measures when the record is this machine', () => {
      const mine = withCosts({ measuredAt: 'then', samples: {}, skipped: [], unmeasured: [], machine: HERE });
      expect(writesMembershipOnly(mine, false), 'its costs are this box\'s to write').toBe(false);
    });

    /** `--all --force`: the one case where another machine's record still means taking readings */
    it('measures when this run is adopting the record', () => {
      expect(writesMembershipOnly(base({}), true)).toBe(false);
    });
  });

  it('drops a spec that has gone, from whichever list held it', () => {
    const next = recordMembership(base({ 'tests/a.spec.ts': 100 }, ['tests/b.spec.ts']), []);

    expect(next.costs).toEqual({});
    expect(next.unmeasured).toEqual([]);
  });

  it('counts an unmeasured spec as recorded, which is what makes the record satisfiable', () => {
    const record = base({}, ['tests/b.spec.ts']);

    expect(unrecorded(record, ['tests/b.spec.ts']), 'it is listed, so it is not unrecorded').toEqual([]);
    expect(unrecorded(record, ['tests/c.spec.ts']), 'and one that is listed nowhere still is')
      .toEqual(['tests/c.spec.ts']);
  });

  it('retires it once the measuring machine has priced it', () => {
    const { record } = settle({
      previous: base({}, ['tests/b.spec.ts']),
      costs: { 'tests/b.spec.ts': 250 },
      skipped: [], measuredFiles: ['tests/b.spec.ts'], prune: [], forgetWindows: false,
    });

    expect(record.unmeasured, 'it has a cost now, so it is not waiting for one').toEqual([]);
    expect(record.costs).toEqual({ 'tests/b.spec.ts': 250 });
  });

  /**
   * The machine is the record's own until a run adopts it, which is `--all --force`.
   *
   * Without this the field would be written once and then carried by nobody: `settle` rebuilds the record
   * from scratch with no spread of `previous`, so a field it does not name is a field the next update drops.
   */
  it('keeps the record\'s machine, and takes it only when adopting', () => {
    const input = {
      previous: base({ 'tests/a.spec.ts': 100 }),
      costs: { 'tests/a.spec.ts': 400 },
      skipped: [], measuredFiles: ['tests/a.spec.ts'], prune: [], forgetWindows: true,
    };

    expect(settle(input).record.machine).toEqual(OTHER);
    expect(settle({ ...input, adopt: true }).record.machine, 'adopting is re-measuring and taking it over')
      .toEqual(thisMachine());
  });
});

describe.skipIf(!ON_MEASURED_MACHINE)(`a spec runs in the half its cost puts it in${OFF_BOX}`, () => {
  it(`moves a fast spec above ${INTEGRATION_ABOVE_MS}ms, and brings an integration one back below ${FAST_BELOW_MS}ms`, () => {
    const wrong = suites
      .filter(({ record }) => record)
      .flatMap(({ suite, dir, record, files }) => overBudget(dir, record!.samples, files)
        .filter((found) => found.kind === 'rename')
        .map((found) => `${suite.dir}/${found.file} costs ${(found.ms / 1000).toFixed(1)}s, which is ${found.belongs}, but it is in the ${halfOfPath(found.file)} half`));
    expect(wrong, 'rename these, or re-measure if the cost has genuinely changed').toEqual([]);
  });

  /**
   * And every fast spec can *notice* a crossing, which is the half of this the band used to swallow.
   *
   * Over the real records rather than a fixture, because the defect was a property of the recorded values: the
   * band is 35% of the cost and the edge is fixed, so the specs nearest the edge were the ones whose band
   * reached past it. Measured 2026-10-03, before `worthKeeping` composed the edge in: 7 of 363 would have
   * dropped a reading one millisecond past the edge, `spec-plan-collect` at 2421 being blind up to 3268. A
   * dropped reading is a median that never moves, so the case above could not fire however slow the spec got.
   *
   * It asks the cheapest possible crossing — one millisecond over — because that is the reading the band is
   * widest against, and a check that passed only for an extreme one would leave the hole where it was.
   */
  it('keeps a reading one millisecond past the edge, for every fast spec on record', () => {
    const blind = suites
      .filter(({ record }) => record)
      .flatMap(({ suite, dir, record, files }) => files
        .filter((file) => halfOfPath(file) === 'fast' && hasSplit(path.join('packages', dir))
          && record!.samples[file] !== undefined)
        .filter((file) => !worthKeeping(file, record!.costs[file]!, INTEGRATION_ABOVE_MS + 1))
        .map((file) => `${suite.dir}/${file} costs ${record!.costs[file]}ms, whose band reaches past the edge`));
    expect(blind, 'these could not notice a crossing, so their half could never be questioned').toEqual([]);
  });

  // The number the threshold is for, and it is a proxy — say so rather than let the next reader take it for
  // elapsed time. It is summed *file* time across parallel workers, so 30s of it is roughly 13s of waiting;
  // and it excludes collection, which the same run reports as 22.3s against 16.9s of tests, so the larger
  // half of the work is not in it (`abuddy-sdk/tests/build/declared-type-of.spec.ts` moves fixture building
  // into `beforeAll` for exactly that reason). It is kept because it is the stable statistic available:
  // a sum moves 0.4-9.9% between idle runs where its members move 10-18% each, and a wall-clock sample of
  // the same unchanged suite read 6.5, 10.3, 8.1 and 7.0s. `drift` is what watches the part this cannot.
  it('leaves the fast half worth running in a loop', () => {
    const cli = suites.find(({ suite }) => suite.dir === 'abuddy-cli')!;
    const fast = cli.files.filter((file) => halfOfPath(file) === 'fast');

    // **It refuses to vouch over a gap rather than vouching.** A missing cost used to sum as zero, so the
    // total got smaller as the half got bigger — and the `unmeasured` list a second developer writes into is
    // exactly a set of specs with no cost. The absent-record case was worse: `record?.costs[...] ?? 0` made
    // the whole total 0 and this assertion passed over nothing at all. `priceSpecs`' doc has the rule —
    // *"an unrecorded spec is named, never treated as zero: a total that quietly omits a file is a prediction
    // that gets better the less it knows"* — and this is the same rule for a budget.
    //
    // Safe as a failure because this describe is machine-scoped: off the reference box it does not run, so
    // the only person it stops is the one who can price them with one command.
    // Through `priceSpecs` rather than a sum written here, because it already keeps that rule and already
    // names what it could not price (`spec-dry.ts`). A second total would be a second place to get it wrong.
    const priced = priceSpecs(fast.map((file) => path.join('packages', cli.suite.dir, file)), REPO_ROOT);
    expect(priced.unpriced, 'these have no cost, so a total would understate the half it is vouching for. '
      + `Run: npm run spec-cost:update -- --suite ${cli.suite.dir}`).toEqual([]);

    const total = priced.fileTimeMs;
    expect(total, `the fast half is ${(total / 1000).toFixed(1)}s of file time across ${fast.length} specs`).toBeLessThan(30_000);
  });
});


/**
 * What a run says it found. The defect this covers was a string: `spec-cost:update` told a package with one
 * half that two of its specs were "in the wrong half" and pointed each at `integration`, a half that
 * package has not got — and following it renames a file that still matches the same include glob, so the
 * spec keeps running where it was and the warning goes quiet.
 *
 * So the strings are the assertion. They are also the only reachable form of this: `--dry` reports no
 * finding at all, which left the wording exercised only by a measuring run that rewrites the records.
 */
describe('what a run says about a spec it cannot place', () => {
  const OVER = { kind: 'over', file: 'tests/slow.spec.ts', ms: 9_000 } as const;
  const RENAME = {
    kind: 'rename', file: 'tests/slow.spec.ts', ms: 9_000, belongs: 'integration', readings: 3,
  } as const;

  it('never tells a package with one half to move a spec', () => {
    const said = describeBudget([OVER], 'any-suite');
    expect(`${said.tail} ${said.lines.join(' ')} ${said.advice}`.toLowerCase()).not.toContain('wrong half');
    expect(said.advice.toLowerCase()).not.toContain('rename');
    expect(said.advice, 'the fix there is to record it, which is what EXPENSIVE_BY_NATURE is')
      .toContain('EXPENSIVE_BY_NATURE');
  });

  it('tells a package with two halves to rename, and says which', () => {
    const said = describeBudget([RENAME], 'any-suite');
    expect(said.tail).toContain('wrong half');
    expect(said.advice.toLowerCase()).toContain('rename');
    expect(said.lines.join(' ')).toContain('integration');
  });

  /**
   * The entries in `EXPENSIVE_BY_NATURE` are costs somebody has already looked at and written a reason for,
   * which is the whole thing an `over` finding is for. Reporting them anyway printed `record it in
   * EXPENSIVE_BY_NATURE` on every `--all` run for all five — advice that cannot be followed, in the one
   * channel that has to stay worth reading.
   */
  it('says nothing about a cost already recorded as expensive by nature', () => {
    const [key] = Object.keys(EXPENSIVE_BY_NATURE);
    const [suiteDir, ...rest] = key!.split('/');
    const recorded = { kind: 'over', file: rest.join('/'), ms: 9_000 } as const;
    expect(describeBudget([recorded], suiteDir!)).toEqual({ tail: '', lines: [], advice: '' });
    // The same finding under a suite with no entry is still reported, so the filter is why, not the shape
    expect(describeBudget([recorded], 'a-suite-with-no-entries').advice).toContain('EXPENSIVE_BY_NATURE');
  });

  /**
   * **The advice promises nothing about what a re-measurement would do, and three versions did.**
   *
   * *"no measurement will move it"*, then *"two readings agree, so re-measuring will not move them"* — true
   * of no window in the repo, where 388 of 389 held one reading — then *"the median of N readings, so
   * re-measuring will not move it"*, false at every length. A three-reading median moves on **one** reading
   * when the eviction takes the oldest from under it, and a two-reading cost is the incumbent rather than a
   * median, which one agreeing reading replaces. The two cases below the fixtures hold that arithmetic, so
   * this one can hold the sentence.
   *
   * What is left is the one claim that is both true and actionable, and only where it applies: a clean
   * re-measurement of a one-reading cost is *dropped*, so the command the second version named cannot
   * replace it.
   */
  it('claims nothing about re-measuring, whatever the cost rests on', () => {
    for (const readings of [1, 2, 3]) {
      const said = describeBudget([{ ...RENAME, readings }], 'any-suite');
      expect(said.advice, `${readings} reading(s): no guarantee the window does not give`)
        .not.toMatch(/will not move|readings agree/);
    }
  });

  it('names the one command that can replace a cost resting on a single reading', () => {
    const said = describeBudget([{ ...RENAME, readings: 1 }], 'any-suite');

    expect(said.advice).toContain('npm run spec-cost:update -- --all --forget');
    expect(said.advice, 'and says why the per-spec command is not the answer')
      .toContain('re-measuring that spec alone will not');
  });

  it('says nothing about forgetting where every cost is corroborated', () => {
    const said = describeBudget([{ ...RENAME, readings: 3 }], 'any-suite');

    expect(said.advice, 'there is no single reading to replace').not.toContain('--forget');
    expect(said.advice).toBe('Rename it into the half the cost implies.');
  });

  /**
   * And the count is on the finding's own line, which is what let the advice stop speaking for all of them.
   *
   * How settled a cost is, is a fact about that spec; the advice is one sentence for the set. Keeping the
   * count in the advice is what forced it to generalise, and generalising is what made it false.
   */
  it('puts what a cost rests on beside the cost, and says what is standing at two', () => {
    const line = (readings: number) => describeBudget([{ ...RENAME, readings }], 'any-suite').lines.join('');

    expect(line(1)).toContain('(1 reading)');
    expect(line(3)).toContain('(median of 3)');
    // The one that matters: a two-reading cost is the *older* of two that disagree, so a count would read as
    // corroboration where the number is the least settled of the three states
    expect(line(2), 'never a bare count, which reads as support').not.toContain('2 readings');
    expect(line(2)).toContain('(2 disagreeing, older standing)');
  });

  /**
   * The arithmetic the advice used to contradict, from the real functions rather than from reasoning.
   *
   * These are the two cases that make "re-measuring will not move it" false, and they are here so that the
   * claim cannot come back a fourth time without one of them failing.
   */
  it('moves a three-reading median on one reading, because the window drops its oldest', () => {
    const window = [1_000, 4_000, 5_000];
    expect(costOf(window)).toBe(4_000);
    expect(disagrees(costOf(window), 6_000), 'so settle keeps it').toBe(true);
    expect(appendSample(window, 6_000), 'and the 1000 under the median leaves').toEqual([4_000, 5_000, 6_000]);
    expect(costOf(appendSample(window, 6_000)), 'which moves the median on a single reading').toBe(5_000);
  });

  it('moves a two-reading cost on one agreeing reading, since that cost is the incumbent', () => {
    const window = [2_041, 4_000];
    expect(costOf(window), 'the older reading, not a median of the two').toBe(2_041);
    expect(costOf(appendSample(window, 4_000)), 'and one that agrees with the newer takes it').toBe(4_000);
  });

  it('says nothing at all when there is nothing to say', () => {
    expect(describeBudget([], 'any-suite')).toEqual({ tail: '', lines: [], advice: '' });
  });
});

/**
 * Which edge a spec is near, which is the question `--list` renders.
 *
 * Band membership used to be the answer, and it conflated two: only the upper edge can move a fast spec
 * and only the lower one can move an integration spec, so a fast spec at 1 673ms was reported as one a
 * re-measurement could move when it would have had to nearly double. Lowering the return edge made that
 * worse rather than better — five more specs became members, none of them able to move.
 */
/**
 * A move re-measures the constant that permitted it.
 *
 * `CONTENTION_RATIO_MAX` is a sample: it records a measurement and has nothing to re-derive it from, which
 * is the shape that produced the defect it exists to prevent. What checks it is the moves it causes — the
 * record holds what a spec cost in the half it left, an update measures what it costs where it arrived, and
 * the quotient is the thing the band has to cover. Free, and it arrives exactly when the number matters.
 */
describe('what a spec that changed half says about the band', () => {
  const FAST = 'tests/x.spec.ts';
  const SLOW = 'tests/x.integration.spec.ts';
  const record = (costs: Record<string, number>): SpecCost =>
    withCosts({ measuredAt: 'then', samples: windows(costs), skipped: [], unmeasured: [], machine: thisMachine() });

  it('reads the ratio off a move in either direction', () => {
    expect(ratiosFromMoves(record({ [FAST]: 2_000 }), { [SLOW]: 1_000 }, [SLOW], [SLOW]))
      .toEqual([{ spec: SLOW, fast: 2_000, integration: 1_000, ratio: 2 }]);
    expect(ratiosFromMoves(record({ [SLOW]: 1_000 }), { [FAST]: 2_000 }, [FAST], [FAST])[0])
      .toMatchObject({ fast: 2_000, integration: 1_000, ratio: 2 });
  });

  /**
   * The counterpart must be gone from *disk*, not merely unmeasured. A run that names one spec measures
   * one config, so "the other half has no reading" is true of every spec in the suite — pairing on that
   * would read an ordinary new spec as a move the moment something shared its name in the other half.
   */
  it('is not a move while both halves of the name are still there', () => {
    expect(ratiosFromMoves(record({ [FAST]: 2_000 }), { [SLOW]: 1_000 }, [SLOW], [FAST, SLOW])).toEqual([]);
  });

  /**
   * A cheap spec's ratio is noise, and acting on it is worse than ignoring it: 10ms reading 3ms in the
   * other half is 3.33x, which would advise raising the bound and so lowering the return edge over 7ms of
   * jitter. Only a spec that could reach an edge says anything about where the edges go.
   */
  it('ignores a move too cheap to say anything about the band', () => {
    expect(ratiosFromMoves(record({ [FAST]: 10 }), { [SLOW]: 3 }, [SLOW], [SLOW])).toEqual([]);
    const real = FAST_BELOW_MS + 1;
    expect(ratiosFromMoves(record({ [FAST]: real }), { [SLOW]: real / 2 }, [SLOW], [SLOW])).toHaveLength(1);
  });

  it('says nothing when the spec is new rather than moved', () => {
    expect(ratiosFromMoves(record({}), { [SLOW]: 1_000 }, [SLOW], [SLOW])).toEqual([]);
  });

  it('calls out only a ratio the band does not cover', () => {
    expect(underBound([{ ratio: CONTENTION_RATIO_MAX }]), 'exactly at the bound is covered').toBe(false);
    expect(underBound([{ ratio: CONTENTION_RATIO_MAX + 0.01 }])).toBe(true);
    expect(underBound([])).toBe(false);
  });
});


describe('how close a spec is to changing half', () => {
  const FAST = 'tests/x.spec.ts';
  const SLOW = 'tests/x.integration.spec.ts';

  it('measures a fast spec against the upper edge and an integration one against the lower', () => {
    expect(towardEdge(FAST, INTEGRATION_ABOVE_MS)).toBe(0);
    expect(towardEdge(SLOW, FAST_BELOW_MS)).toBe(0);
    // The edge that cannot move it is not the one measured: a fast spec at the lower edge is far away
    expect(towardEdge(FAST, FAST_BELOW_MS)).toBeGreaterThan(COST_ACCURACY);
  });

  it('calls a spec near when a re-measurement inside the record\'s own accuracy would carry it over', () => {
    expect(nearEdge(FAST, Math.round(INTEGRATION_ABOVE_MS / (1 + COST_ACCURACY)) + 1)).toBe(true);
    expect(nearEdge(FAST, Math.round(INTEGRATION_ABOVE_MS / (1 + COST_ACCURACY)) - 50)).toBe(false);
  });

  /**
   * Over the live records, so the report `--list` prints is the one asserted here rather than a second
   * reading of the same rule. A spec in a one-config package is excluded for the reason `overBudget`
   * excludes it: there is no half to move into, so no edge applies.
   */
  it.skipIf(!ON_MEASURED_MACHINE)(`finds the specs that really are close, and only in a package with somewhere to go${OFF_BOX}`, () => {
    const close = suites
      .filter(({ dir }) => hasSplit(dir))
      .flatMap(({ suite, record }) => Object.entries(record?.costs ?? {})
        .filter(([file, ms]) => nearEdge(file, ms))
        .map(([file]) => `${suite.dir}/${file}`));
    expect(close, 'nothing is near an edge, so this rule is reading an empty population').not.toEqual([]);
  });

  // `nearEdge` answers for a cost and a half and knows nothing about packages — `--list` and `overBudget`
  // both apply `hasSplit` themselves, so the question is asked once and the guard sits where it belongs
  it('asks only about the cost and the half, leaving the package to the caller', () => {
    expect(nearEdge(FAST, INTEGRATION_ABOVE_MS - 1)).toBe(true);
  });
});


describe.skipIf(!ON_MEASURED_MACHINE)(`a spec that costs more than a fast half allows${OFF_BOX}`, () => {
  // No `!split` filter: `overBudget` returns this kind only for a package that has nowhere to move a spec
  // to, which is the same question, asked once, in the one place that cannot forget to ask it
  const found = () => suites
    .filter(({ record }) => record)
    .flatMap(({ suite, dir, record, files }) => overBudget(dir, record!.samples, files)
      .filter((budget) => budget.kind === 'over')
      .map(({ file, ms }) => ({ key: `${suite.dir}/${file}`, ms })));

  it('is recorded, with what makes it expensive', () => {
    const unlisted = found()
      .filter(({ key }) => !(key in EXPENSIVE_BY_NATURE))
      .map(({ key, ms }) => `${key} costs ${(ms / 1000).toFixed(1)}s, over the ${INTEGRATION_ABOVE_MS / 1000}s a fast half allows`);
    expect(unlisted, 'make it cheaper, or record it in EXPENSIVE_BY_NATURE with what makes it expensive').toEqual([]);
  });

  // The other direction: an entry that has become cheap is one the list should stop carrying
  it('records nothing that has since become cheap', () => {
    const live = new Set(found().map(({ key }) => key));
    expect(Object.keys(EXPENSIVE_BY_NATURE).filter((key) => !live.has(key)),
      'these are no longer expensive; drop them from EXPENSIVE_BY_NATURE').toEqual([]);
  });
});


/**
 * When a measurement replaces the recorded one, and when a run is read as measuring the machine.
 *
 * Both are pure, and both went in without a case: the tolerance was checked by recording a suite three times
 * and diffing, the refusal by hand-wrecking a record. Neither left anything behind that runs again.
 */
describe('a measurement replaces the record only when it says something new', () => {
  const FAST = 'tests/x.spec.ts';
  const SLOW = 'tests/x.integration.spec.ts';

  /**
   * The two edges have to agree with each other, and for a year they did not.
   *
   * A move changes the reading — that is the whole reason there are two edges rather than one — so a band
   * narrower than the change makes the pair contradictory: a fast spec above the upper edge is told to
   * move, reads lower in the other half, and is told to come back. `spec-plan.spec.ts` sat in that loop at
   * 2.8s fast against 1.4s integration, with a band of 1.67x against readings differing by up to 1.99x.
   *
   * Asserted over `halfFor` rather than over the arithmetic, because the arithmetic restates the branches
   * instead of exercising them: swapping a `>` for a `>=` leaves the inequality true. Both directions,
   * because each of the two specs that exposed this demonstrated a different one.
   */
  describe('the two edges agree about where a spec belongs', () => {
    it('never sends a spec back the way it came, at any cost', () => {
      let out = 0;
      let back = 0;
      for (let ms = 1; ms <= 40_000; ms += 1) {
        if (halfFor(FAST, ms) !== 'fast') {
          out += 1;
          expect(halfFor(SLOW, ms / CONTENTION_RATIO_MAX), `${ms}ms left the fast half`).toBe('integration');
        }
        if (halfFor(SLOW, ms) !== 'integration') {
          back += 1;
          expect(halfFor(FAST, ms * CONTENTION_RATIO_MAX), `${ms}ms came back to the fast half`).toBe('fast');
        }
      }
      // Without these the property passes over nothing: a `halfFor` that always returns the half it was
      // given enters neither branch, which is the shape this repo keeps shipping
      expect(out, 'no cost in the scan ever left the fast half').toBeGreaterThan(0);
      expect(back, 'no cost in the scan ever came back to it').toBeGreaterThan(0);
    });
  });

  it('keeps a reading for a spec it has never seen', () => {
    expect(disagrees(undefined, 120)).toBe(true);
  });

  it('keeps a large move, so the number stays roughly true', () => {
    expect(disagrees(400, 1_200)).toBe(true);
  });

  // The case the band exists for: `generated-behind-contract` runs codegen over a temp pack and reads
  // anywhere in this range between idle runs. Both values say the same thing, and keeping each of them
  // grew a window — and before the window, rewrote the file — on every update.
  it('drops jitter in a spec that is simply variable, so a quiet run writes nothing', () => {
    expect(disagrees(995, 714)).toBe(false);
    expect(disagrees(714, 995)).toBe(false);
  });

  /**
   * **This is also what holds `WINDOW` above 1**, which is the one property upstream stopped covering:
   * `RECORD_IDLE_FLOOR` (`measure.ts`) guards a recording's *body* and was never sized against a single
   * contended reading placing a spec in the wrong half. Checked on a mutant rather than assumed — at
   * `WINDOW = 1` the first assertion below reads 2791 instead of 2041, the contended reading becoming the
   * answer, which is the defect itself rather than an inequality about a constant. A separate
   * `WINDOW > 1` case was written and dropped for that reason: it fires later and says less.
   *
   * **A crossing is not special, and it used to be.** `moved` opened with
   * `halfFor(measured) !== halfFor(recorded) -> true`, so the one decision with a cliff was the one where
   * a single reading was adopted outright. These two cases are what that cost, replayed from the readings
   * that caused it, and they are the reason `disagrees` has no such clause.
   */
  it('does not let one reading carry a spec over the edge', () => {
    expect(halfFor(FAST, 2_791), 'the contended reading, on its own, is integration').toBe('integration');
    expect(costOf(appendSample([2_041], 2_791)), 'the window keeps the incumbent').toBe(2_041);
    expect(halfFor(FAST, costOf(appendSample([2_041], 2_791))),
      'so nothing is told to move on the strength of it').toBe('fast');

    // And not for an extreme one either, which the textbook median does not give you: averaging the two
    // middles put `[2041] + 4000` at 3021 and over the edge, which is the defect with an extra step
    expect(costOf(appendSample([2_041], 4_000)), 'however far the one reading is').toBe(2_041);
    expect(halfFor(FAST, costOf(appendSample([2_041], 4_000)))).toBe('fast');
  });

  it('adopts a crossing on the second reading that agrees', () => {
    const once = appendSample([2_041], 4_000);
    expect(halfFor(FAST, costOf(once)), 'one reading at 4s is not yet believed').toBe('fast');
    const twice = appendSample(once, 4_000);
    expect(costOf(twice), 'two agreeing readings are').toBe(4_000);
    expect(halfFor(FAST, costOf(twice))).toBe('integration');
  });

  /**
   * The second defect, and the one the band itself caused: a contended reading that landed could not be
   * displaced, because `moved` then needed 35% of it to change. Measured 2026-10-03,
   * `generated-behind-contract` was recorded at 1360 from a contended run and read 1125 on a clean one —
   * a gap of 235 against a threshold of 476, so the clean reading was discarded and the wrong value stayed.
   *
   * **What closes that case is the band, not the window**, and being exact about it matters because the first
   * version of these two cases was not. 1360 sits *inside* `disagrees`' band around 1203, so under this rule
   * the reading never enters the record and there is nothing to displace. The window covers the other
   * reading — one far enough out to be kept — and there it parks it and the median does not move.
   *
   * It does not age out, which is the limit `WINDOW`'s doc records: the clean reading that follows agrees
   * with the median and is dropped, so the outlier stays in the window. The case this replaces asserted the
   * opposite by calling `appendSample` directly, reaching a window `settle` cannot build and then claiming
   * the outlier "leaves entirely".
   */
  it('never records the contended reading that caused the defect, so nothing has to displace it', () => {
    // `settle` appends only what `disagrees` with the median, so these are that branch with its own operands
    expect(disagrees(1_203, 1_360), 'the contended reading is inside the band, so it is dropped').toBe(false);
    expect(disagrees(1_203, 1_125), 'and so is the clean one, which therefore changes nothing either')
      .toBe(false);
  });

  /**
   * **A reading that crosses the placement edge is kept, however far inside the band it sits.**
   *
   * The band scales with the recorded value and the edge does not, so for the specs nearest the edge the band
   * swallows it: measured 2026-10-03 against the real records, 7 of 363 fast specs had an agree-band reaching
   * past `INTEGRATION_ABOVE_MS` — `spec-plan-collect` at 2421 was invisible up to 3268. For those, a genuine
   * move into the integration half could never be *kept*, so the median never moved and `priceSpecs` went on
   * summing a stale number into the fast half's budget. The window was most inert for exactly the specs
   * placement is about.
   *
   * **`moved` had this clause and #219 deleted it as the cause of the defect.** It was right about what to
   * notice and wrong about what to do: it *adopted* a crossing from one reading. On the keep side it is what
   * the window was built to make safe — the two cases above this one are the adoption path, and they are
   * unchanged.
   */
  it('keeps a reading that crosses the edge, even where the band would have dropped it', () => {
    // `chain-inputs`' own numbers: recorded 2186, band 765, edge 2500 — so 2600 is a crossing inside the band
    expect(disagrees(2_186, 2_600), 'the band alone drops it').toBe(false);
    expect(worthKeeping(FAST, 2_186, 2_600), 'the edge is what keeps it').toBe(true);

    expect(costOf(appendSample([2_186], 2_600)), 'kept, and still not adopted').toBe(2_186);
    expect(halfFor(FAST, costOf(appendSample([2_186], 2_600))), 'so nothing is told to move yet').toBe('fast');
  });

  it('keeps nothing extra where both readings sit in the same half', () => {
    // The clause is the edge and not the band widened: two fast readings inside the band are still dropped
    expect(worthKeeping(FAST, 1_000, 1_050), 'a reading the band is there to drop').toBe(false);
    expect(worthKeeping(FAST, 2_186, 2_400), 'and one that moves without crossing').toBe(false);
  });

  it('parks a reading far enough out to be kept, and cannot let it age out', () => {
    expect(disagrees(1_203, 2_000), 'outside the band, so this one is kept').toBe(true);
    const parked = appendSample([1_203], 2_000);
    expect(costOf(parked), 'and the median stays with the incumbent').toBe(1_203);

    expect(disagrees(costOf(parked), 1_125), 'a clean reading after it agrees, so it is dropped').toBe(false);
    expect(parked, 'which leaves the outlier where it is — two on one side is what moves a median')
      .toEqual([1_203, 2_000]);
  });

  it('keeps at most WINDOW readings, oldest first out', () => {
    const full = [1, 2, 3].reduce(appendSample, [] as readonly number[]);
    expect(full).toHaveLength(WINDOW);
    expect(appendSample(full, 4), 'the oldest leaves').toEqual([2, 3, 4]);
  });

  it('takes the median, which is what rejects one reading of three', () => {
    expect(costOf([100]), 'one reading is itself').toBe(100);
    expect(costOf([100, 9_999, 110]), 'three reject the outlier outright').toBe(110);
  });


  // The tie, which is the only place this departs from the textbook median. Two readings that disagree
  // have no majority between them, and a decision with no majority must not move an answer.
  it('answers a tied window with the reading that was already believed', () => {
    expect(costOf([100, 200]), 'the incumbent, not the mean').toBe(100);
    expect(costOf([200, 100]), 'in either direction').toBe(200);
    expect(costOf([100, 200, 200]), 'and the third reading breaks it').toBe(200);
  });
});

describe('a run that moved too much was measuring the machine', () => {
  const specs = (n: number, prefix: string): string[] => Array.from({ length: n }, (_, i) => `tests/${prefix}${i}.spec.ts`);

  // The regression: `moved` is true for a spec with no recorded value, so counting additions read eight new
  // specs in a suite of twenty-eight as a contended run and refused it, naming the machine.
  it('does not read specs measured for the first time as a machine under load', () => {
    const previous = withCosts({ measuredAt: '', skipped: [], unmeasured: [], machine: thisMachine(), samples: windows(Object.fromEntries(specs(20, 's').map((spec) => [spec, 100]))) });
    const measured = [...specs(20, 's'), ...specs(8, 'new')];
    const settled = { ...previous.samples, ...Object.fromEntries(specs(8, 'new').map((spec) => [spec, [50]])) };
    const readings = Object.fromEntries(measured.map((spec) => [spec, previous.costs[spec] ?? 50]));
    const { added, moved: movedSpecs, appended } = changesIn(previous, settled, readings);
    expect(added, 'the eight new ones').toHaveLength(8);
    expect(movedSpecs, 'and nothing that had a value moved').toHaveLength(0);
    expect(appended, 'nor did any of their windows grow').toHaveLength(0);
    expect(contended(appended.length, measured.length - added.length)).toBe(false);
  });

  it('reads a suite whose recorded specs mostly moved as one', () => {
    expect(contended(6, 20)).toBe(true);
  });

  it('never refuses a suite that had nothing to compare against', () => {
    expect(contended(0, 0), 'a record written for the first time').toBe(false);
  });
});

describe('a run that moved as a body has drifted, however little each spec moved', () => {
  /** `bodyDrift` over the record shape these cases are written in, which is this file's subject */
  const drift = (recorded: Record<string, number> | undefined, measured: Record<string, number>) =>
    bodyDrift(new Map(Object.entries(recorded ?? {})), new Map(Object.entries(measured)));
  const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`tests/s${i}.spec.ts`, 100]));

  // The case the per-spec tolerance cannot see: a fifth added to everything stays under every individual
  // threshold, so nothing re-records and the total silently stops being true
  it('sees a uniform slowdown that no single spec would report', () => {
    const measured = Object.fromEntries(Object.entries(twenty).map(([spec, ms]) => [spec, ms * 1.2]));
    expect(Object.values(measured).every((ms) => !disagrees(100, ms)),
      'and not one of them moved on its own').toBe(true);
    expect(drift(twenty, measured)).toBeCloseTo(0.2, 5);
    expect(drifted(drift(twenty, measured)), 'so the body is what reports it').toBe(true);
  });

  it('cancels jitter that falls both ways', () => {
    const measured = Object.fromEntries(Object.entries(twenty).map(([spec, ms], i) => [spec, i % 2 ? ms * 1.3 : ms * 0.7]));
    expect(drifted(drift(twenty, measured)), 'which is jitter, not a slowdown').toBe(false);
  });

  // Undefined and not 0: the caller prints the fragment only when there is one, because `body +0%` reads as
  // "steady" where the answer is "nothing to compare against"
  it('reads nothing from a run that measured nothing, rather than dividing by it', () => {
    expect(drift(twenty, {})).toBeUndefined();
    expect(drift(undefined, twenty)).toBeUndefined();
    expect(drifted(undefined), 'and nothing to compare is not a drift to warn about').toBe(false);
  });

  it('ignores specs the record has never seen, which have nothing to have drifted from', () => {
    expect(drift(twenty, { 'tests/new.spec.ts': 9_000 })).toBeUndefined();
    expect(drift(twenty, { ...twenty, 'tests/new.spec.ts': 9_000 }), 'and reads the rest as steady')
      .toBeCloseTo(0, 5);
  });
});

/**
 * What the command accepts, and what it refuses.
 *
 * Every case here was a defect: an argument accepted and then not used, which the command reported as having
 * done the job. They live in `scripts/lib/spec-cost.ts` rather than the command because `scripts/spec-cost.ts`
 * runs on import, so the only way to test the parsing inline in it was to run it — and none of these was
 * caught by anything for that reason.
 */
describe('the command refuses arguments it cannot honour', () => {
  const DIRS = ['repo-checks', 'abuddy-cli', 'abuddy-sdk'];
  const spec = (dir: string, file = 'tests/a.spec.ts'): string => `packages/${dir}/${file}`;

  it('takes a suite and a path inside it', () => {
    const args = parseArgs(['--update', '--suite', 'repo-checks', spec('repo-checks')], DIRS);
    expect(args).toMatchObject({ mode: 'update', only: 'repo-checks', named: [spec('repo-checks')], all: false });
  });

  // It used to AND the two filters, so the plan list came out empty and `update` printed "every record is
  // current" — a claim about suites it had not looked at — and exited 0
  it('refuses a suite and a path that name different suites', () => {
    expect(() => parseArgs(['--update', '--suite', 'repo-checks', spec('abuddy-cli')], DIRS))
      .toThrow(/--suite repo-checks and these paths name different suites/);
  });

  // `args[i + 1]` was undefined, which skipped the validation below it and meant every suite: with `--all`
  // that is the whole 315s rather than the one suite asked for
  it('refuses a --suite with nothing after it', () => {
    expect(() => parseArgs(['--update', '--suite'], DIRS)).toThrow(/`--suite` needs a suite after it/);
    expect(() => parseArgs(['--update', '--suite', '--all'], DIRS)).toThrow(/`--suite` needs a suite after it/);
  });

  it('refuses --all together with a named spec, which ask for different work', () => {
    expect(() => parseArgs(['--update', '--all', spec('repo-checks')], DIRS)).toThrow(/they contradict/);
  });

  it('names the suites it knows when given one it does not', () => {
    expect(() => parseArgs(['--update', '--suite', 'nope'], DIRS)).toThrow(/No suite "nope"[\s\S]*repo-checks/);
  });

  // The suites are a parameter, so this can drop one and watch the answer flip — the check that the refusal
  // reads the list at all rather than a pattern that happens to match
  it('reads the suite list it is given, not a shape it assumes', () => {
    expect(parseArgs([spec('abuddy-cli')], DIRS).named).toEqual([spec('abuddy-cli')]);
    expect(() => parseArgs([spec('abuddy-cli')], DIRS.filter((dir) => dir !== 'abuddy-cli')))
      .toThrow(/in no unit suite/);
  });

  it('reads a positional argument as a path even when it reads like a suite name', () => {
    expect(() => parseArgs(['--suite', 'repo-checks', 'repo-checks'], DIRS)).toThrow(/in no unit suite/);
  });

  it('defaults to checking, and takes its flags', () => {
    expect(parseArgs([], DIRS)).toMatchObject({ mode: 'check', only: undefined, named: [], force: false, all: false, dry: false });
    expect(parseArgs(['--list'], DIRS).mode).toBe('list');
    expect(parseArgs(['--update', '--dry', '--force', '--all'], DIRS))
      .toMatchObject({ mode: 'update', dry: true, force: true, all: true });
  });
});

describe('what a suite needs measuring is read from its record before anything runs', () => {
  const HERE = 'repo-checks';
  const halves = (half: 'fast' | 'integration'): string[] =>
    specFiles(path.join(REPO_ROOT, 'packages', HERE)).filter((file) => halfOfPath(file) === half);

  // Derived from the tree, so assert they are there: with a `find(...)!` that came back undefined, the cases
  // below would fail saying "not specs in repo-checks", which is about the wrong thing entirely
  it('has a spec in each half to plan for', () => {
    expect(halves('fast').length, 'the cases below name one of each').toBeGreaterThan(0);
    expect(halves('integration').length).toBeGreaterThan(0);
  });

  it('runs only the config that measures the spec you named', () => {
    expect(planFor(REPO_ROOT, HERE, [halves('fast')[0]!], false).configs).toEqual(['vitest.config.ts']);
    expect(planFor(REPO_ROOT, HERE, [halves('integration')[0]!], false).configs).toEqual(['vitest.integration.config.ts']);
  });

  it('runs both halves for --all', () => {
    expect(planFor(REPO_ROOT, HERE, [], true))
      .toMatchObject({ configs: ['vitest.config.ts', 'vitest.integration.config.ts'], reason: 'every spec, asked for' });
  });

  // A named path was checked against `packages/<suite>/` and no further, so a typo was mapped to a half by
  // its extension and measured that whole config, recording nothing for it and reporting "none moved"
  it('refuses a named spec that does not exist, rather than measuring its half for nothing', () => {
    expect(() => planFor(REPO_ROOT, HERE, ['tests/does-not-exist.spec.ts'], false))
      .toThrow(/not specs in repo-checks[\s\S]*does-not-exist/);
  });

});

/**
 * The branches a bare `spec-cost:update` takes, which the live tree cannot show.
 *
 * `unmeasured` and `gone` are what the command works out on its own, and against this checkout the record is
 * by definition current — so those two were the uncovered half of `planFor` while the three a caller asks for
 * by name were covered. A temp tree is the only way to hold a record that disagrees with the specs beside it.
 */
describe('a bare update asks for the least the record needs', () => {
  const DIR = 'mini';
  let root = '';
  const write = (rel: string, body: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  const record = (costs: Record<string, number>, skipped: string[] = []): void =>
    write(specCostFile(DIR), `${JSON.stringify({ measuredAt: 'then', samples: windows(costs), skipped, unmeasured: [], machine: thisMachine() }, null, 2)}\n`);

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-cost-'));
    write(`packages/${DIR}/vitest.config.ts`, 'export default {};\n');
    write(`packages/${DIR}/tests/a.spec.ts`, '');
    write(`packages/${DIR}/tests/b.spec.ts`, '');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  /**
   * A record this cannot read as one is absent, not a record with a hole in it.
   *
   * `readSpecCost` is a `JSON.parse` behind a cast, so a file written before a field existed arrived typed as
   * complete. Dropping `machine` from one of the twelve made this spec file fail at *collection* —
   * `Cannot read properties of undefined (reading 'cpu')`, and **no tests at all** — which is the worst shape
   * available, a suite that reports nothing rather than failing about something. Reachable from a branch not
   * yet rebased, a stash, a revert, or a merge from before the field landed.
   *
   * Absent is the right answer rather than a throw: `check` already says *"no <file>; run spec-cost:update"*,
   * which is what a record that has to be re-taken needs to hear. This repo keeps no backward compatibility,
   * so requiring that is the policy; saying it out loud is the part that was missing.
   */
  it.each(['machine', 'unmeasured', 'skipped', 'samples', 'measuredAt'])('reads a record with no %s as no record', (field) => {
    const full = { measuredAt: 'then', samples: { 'tests/a.spec.ts': [100] }, skipped: [], unmeasured: [], machine: thisMachine() };
    write(specCostFile(DIR), `${JSON.stringify(Object.fromEntries(Object.entries(full).filter(([key]) => key !== field)), null, 2)}\n`);

    expect(readSpecCost(root, DIR)).toBeUndefined();
  });

  it('reads a complete one, so the case above is not passing on the parse', () => {
    record({ 'tests/a.spec.ts': 100 });
    expect(readSpecCost(root, DIR)).toMatchObject({ costs: { 'tests/a.spec.ts': 100 }, machine: thisMachine() });
  });

  /**
   * A record from before the window, which is the shape every one of the twelve had. It carries a `costs`
   * map and no `samples`, and it has to read as absent rather than as a record of point estimates — there
   * is no version field, so this is the whole of what tells the two apart, and it is what makes the
   * migration a thing that cannot be half-done.
   */
  it('reads a record of point estimates as no record, since there is nothing to be sure of', () => {
    write(specCostFile(DIR), `${JSON.stringify({
      measuredAt: 'then', costs: { 'tests/a.spec.ts': 100 }, skipped: [], unmeasured: [], machine: thisMachine(),
    }, null, 2)}\n`);
    expect(readSpecCost(root, DIR)).toBeUndefined();
  });

  it('reads a window with no readings in it as no record', () => {
    write(specCostFile(DIR), `${JSON.stringify({
      measuredAt: 'then', samples: { 'tests/a.spec.ts': [] }, skipped: [], unmeasured: [], machine: thisMachine(),
    }, null, 2)}\n`);
    expect(readSpecCost(root, DIR), 'an empty window has no median to take').toBeUndefined();
  });

  it('measures only the half a spec with no recorded cost lives in', () => {
    record({ 'tests/a.spec.ts': 100 });
    expect(planFor(root, DIR, [], false))
      .toMatchObject({ configs: ['vitest.config.ts'], prune: [], reason: '1 unmeasured' });
  });

  it('drops a recorded spec that is gone without measuring anything', () => {
    record({ 'tests/a.spec.ts': 100, 'tests/b.spec.ts': 200, 'tests/gone.spec.ts': 300 });
    expect(planFor(root, DIR, [], false))
      .toMatchObject({ configs: [], prune: ['tests/gone.spec.ts'], reason: '1 gone' });
  });

  it('counts a recorded skip as recorded, so it asks for nothing', () => {
    record({ 'tests/a.spec.ts': 100 }, ['tests/b.spec.ts']);
    expect(planFor(root, DIR, [], false)).toMatchObject({ configs: [], prune: [], reason: 'current' });
  });

  it('measures everything when there is no record at all', () => {
    fs.rmSync(path.join(root, specCostFile(DIR)));
    expect(planFor(root, DIR, [], false))
      .toMatchObject({ configs: ['vitest.config.ts'], prune: [], reason: '2 unmeasured' });
  });
});

describe('what a run does to the record it replaces', () => {
  const FAST = 'tests/a.spec.ts';
  const previous = (costs: Record<string, number>, skipped: string[] = []): SpecCost =>
    withCosts({ measuredAt: 'then', samples: windows(costs), skipped, unmeasured: [], machine: thisMachine() });

  // The defect: the newly-skipped filter read the *settled* costs, which start as everything the record
  // already held — so a spec that had a cost and stopped running was filtered out of `skipped` and kept the
  // cost it no longer has, and the record claimed a duration for a file that ran nothing
  it('drops the cost of a spec that has stopped running, and records it as skipped', () => {
    const { record } = settle({
      previous: previous({ [FAST]: 1_200, 'tests/b.spec.ts': 800 }),
      costs: { 'tests/b.spec.ts': 810 },
      skipped: [FAST],
      measuredFiles: [FAST, 'tests/b.spec.ts'],
      forgetWindows: false, prune: [],
    });
    expect(record.skipped, 'it ran nothing, so it is skipped').toEqual([FAST]);
    expect(record.costs[FAST], 'and it cannot also carry the cost it used to have').toBeUndefined();
    expect(record.measuredAt, 'the record changed, so the run is what dated it').not.toBe('then');
  });

  // `measuredAt` used to be decided by a list of the reasons a record might have changed — a cost moving, a
  // spec arriving, a row pruned. A spec that stopped running was a fourth, so the drop above was computed
  // and then thrown away by a write that kept the previous record
  it('keeps a record nothing moved byte-identical, including its date', () => {
    const before = previous({ [FAST]: 1_000 });
    const { record, added, moved: movedSpecs } = settle({
      previous: before, costs: { [FAST]: 1_050 }, skipped: [], measuredFiles: [FAST], forgetWindows: false, prune: [],
    });
    expect(added).toHaveLength(0);
    expect(movedSpecs, 'inside the tolerance, so nothing was recorded').toHaveLength(0);
    expect(record).toEqual(before);
  });

  // What forgetting is for: a window is deliberately slow to be convinced, which is wrong for a drift that
  // moved everything. `--all --force` says the old readings describe code that is gone.
  it('starts a window again from this run, where it would otherwise drop the reading', () => {
    const inputs = { previous: previous({ [FAST]: 1_000 }), costs: { [FAST]: 1_050 }, skipped: [],
      measuredFiles: [FAST], prune: [] };
    expect(disagrees(1_000, 1_050), 'a reading the band is there to drop').toBe(false);
    expect(settle({ ...inputs, forgetWindows: false }).record.samples[FAST]).toEqual([1_000]);
    expect(settle({ ...inputs, forgetWindows: true }).record.samples[FAST], 'the history goes').toEqual([1_050]);
  });

  // The two counts the report rests on. A first disagreeing reading is kept and changes no answer, so a run
  // that merely noticed something must not print as a suite that has got slower.
  it('counts a window it grew apart from an answer that moved', () => {
    const SLOW = 'tests/slow.spec.ts';
    const inputs = { previous: previous({ [FAST]: 1_000, [SLOW]: 1_000 }), skipped: [],
      measuredFiles: [FAST, SLOW], prune: [], forgetWindows: false };
    const { moved: movedSpecs, appended } = settle({ ...inputs, costs: { [FAST]: 1_050, [SLOW]: 4_000 } });
    expect(appended, 'only the reading that disagreed was kept').toEqual([SLOW]);
    expect(movedSpecs, 'and one reading does not move the median').toEqual([]);

    // The second agreeing reading is what moves it, which is the whole bargain
    const twice = settle({
      ...inputs, previous: settle({ ...inputs, costs: { [SLOW]: 4_000 } }).record, costs: { [SLOW]: 4_000 },
    });
    expect(twice.moved, 'the second agreeing reading moves it').toEqual([SLOW]);
  });

  // The skipped list is content too: a spec can arrive with every test in it skipped, which moves nothing in
  // `costs` and still changes what the record says. Enumerating the reasons a record might have changed
  // missed this one as well, so the comparison is against the record rather than a list of causes.
  it('dates a run where only the skipped list moved', () => {
    const before = previous({ [FAST]: 100 });
    const { record, added, moved: movedSpecs } = settle({
      previous: before,
      costs: { [FAST]: 100 },
      skipped: ['tests/needs-a-binary.spec.ts'],
      measuredFiles: [FAST, 'tests/needs-a-binary.spec.ts'],
      forgetWindows: false, prune: [],
    });
    expect(added, 'nothing was measured for the first time').toHaveLength(0);
    expect(movedSpecs, 'and no cost moved').toHaveLength(0);
    expect(record.costs, 'so the costs are untouched').toEqual(before.costs);
    expect(record.skipped).toEqual(['tests/needs-a-binary.spec.ts']);
    expect(record.measuredAt, 'but the record changed, so it is dated').not.toBe('then');
  });

  /**
   * **A reading that says something new is kept, and does not become the answer on its own.** This case
   * asserted the opposite until 2026-10-03 — one 4s reading against a recorded 1s rewrote the row outright
   * — which is the behaviour a contended run used to exploit. What it checks now is that the run is still
   * *recorded*: the window grew and the record is dated, so nothing is silently discarded while the answer
   * waits for its second reading.
   */
  it('keeps a measurement that says something new, and dates it, without yet believing it', () => {
    const inputs = { skipped: [], measuredFiles: [FAST], forgetWindows: false, prune: [] };
    const first = settle({ ...inputs, previous: previous({ [FAST]: 1_000 }), costs: { [FAST]: 4_000 } });
    expect(first.appended, 'the reading was kept').toEqual([FAST]);
    expect(first.moved, 'and the answer did not move with it').toEqual([]);
    expect(first.record.samples[FAST]).toEqual([1_000, 4_000]);
    expect(first.record.costs[FAST], 'the incumbent still answers').toBe(1_000);
    expect(first.record.measuredAt, 'but the record changed, so it is dated').not.toBe('then');

    const second = settle({ ...inputs, previous: first.record, costs: { [FAST]: 4_000 } });
    expect(second.moved, 'the second agreeing reading is what moves it').toEqual([FAST]);
    expect(second.record.costs[FAST]).toBe(4_000);
  });

  /**
   * **The whole path, replayed from the readings that broke it.** The cases above check `costOf` and
   * `appendSample`; this one runs the sequence through `settle` and asks `overBudget` the question the gate
   * asks, because that is where the answer actually came from: a contended reading of 2791 against a
   * recorded 2041 made `suite-split` demand that `chain-inputs` be renamed into the integration half, and
   * the clean re-measure that followed read 2186 and put it back. Nothing in the suite had got slower.
   *
   * The real package dir, because `overBudget` asks `hasSplit` whether there is a half to move into, and
   * that reads the configs off disk. `repo-checks` has both.
   */
  it('never demands a rename for the contended sequence that caused this', () => {
    const SPEC = 'tests/chain-inputs.spec.ts';
    const dir = path.join(REPO_ROOT, 'packages', 'repo-checks');
    const inputs = { skipped: [], measuredFiles: [SPEC], prune: [], forgetWindows: false };
    const renames = (record: SpecCost): unknown[] =>
      overBudget(dir, record.samples, [SPEC]).filter((found) => found.kind === 'rename');

    const start = previous({ [SPEC]: 2_041 });
    expect(renames(start), 'nothing is wrong to begin with').toEqual([]);

    // The reading that used to be adopted outright, and the rename it used to produce
    expect(halfFor(SPEC, 2_791), 'on its own it really is integration').toBe('integration');
    const contended = settle({ ...inputs, previous: start, costs: { [SPEC]: 2_791 } });
    expect(contended.record.samples[SPEC], 'it is kept, so nothing is discarded').toEqual([2_041, 2_791]);
    expect(renames(contended.record), 'but no rename is asked for').toEqual([]);

    // The clean reading that followed. It agrees with the incumbent — 145ms against a band of 714 — so it
    // is dropped rather than kept, and the answer stays where the two clean readings put it.
    const clean = settle({ ...inputs, previous: contended.record, costs: { [SPEC]: 2_186 } });
    expect(clean.appended, 'it says nothing the window does not already say').toEqual([]);
    expect(clean.record.costs[SPEC], 'so the answer is still the clean one').toBe(2_041);
    expect(renames(clean.record)).toEqual([]);

    // And the other direction, so this is not passing because nothing can ever move: a second reading up
    // there is a genuine majority, and then the rename is the right answer and is asked for.
    const twice = settle({ ...inputs, previous: contended.record, costs: { [SPEC]: 2_791 } });
    expect(twice.record.samples[SPEC]).toEqual([2_041, 2_791, 2_791]);
    expect(twice.record.costs[SPEC], 'two agreeing readings are believed').toBe(2_791);
    expect(renames(twice.record), 'and now it really should move').toHaveLength(1);
  });

  it('drops a pruned spec from both halves of the record', () => {
    const { record } = settle({
      previous: previous({ [FAST]: 100, 'tests/gone.spec.ts': 200 }, ['tests/also-gone.spec.ts']),
      costs: { [FAST]: 100 },
      skipped: [],
      measuredFiles: [FAST],
      forgetWindows: false, prune: ['tests/gone.spec.ts', 'tests/also-gone.spec.ts'],
    });
    expect(Object.keys(record.costs)).toEqual([FAST]);
    expect(record.skipped).toEqual([]);
    expect(record.measuredAt, 'a prune changed the record').not.toBe('then');
  });

  // What the report line reads. It used to enumerate its own reasons — costs moving, specs arriving, rows
  // pruned — so a spec that stopped running rewrote the file and printed "none moved"; the `N skipped` beside
  // it is the total, identical whether the skip is new or carried, so nothing on the line said otherwise.
  it('names a spec that lost its cost, which is neither a move nor an arrival nor a prune', () => {
    const { dropped, added, appended } = settle({
      previous: previous({ [FAST]: 1_200, 'tests/b.spec.ts': 800 }),
      costs: { 'tests/b.spec.ts': 800 },
      skipped: [FAST],
      measuredFiles: [FAST, 'tests/b.spec.ts'],
      prune: [],
      forgetWindows: false,
    });
    expect(dropped, 'the run has to report this, or it reports nothing at all').toEqual([FAST]);
    expect([...added, ...appended], 'and it is neither of the two that were counted').toEqual([]);
  });

  // A pruned spec loses its cost too, and the caller already reports those as `N gone`; counting them here
  // would report one deletion twice
  it('leaves a pruned spec to the caller that pruned it', () => {
    const { dropped } = settle({
      previous: previous({ [FAST]: 100, 'tests/gone.spec.ts': 200 }),
      costs: { [FAST]: 100 },
      skipped: [],
      measuredFiles: [FAST],
      prune: ['tests/gone.spec.ts'],
      forgetWindows: false,
    });
    expect(dropped).toEqual([]);
  });

  it('keeps a skip recorded for a half this run did not measure', () => {
    const { record } = settle({
      previous: previous({ [FAST]: 100 }, ['tests/other.integration.spec.ts']),
      costs: { [FAST]: 100 },
      skipped: [],
      measuredFiles: [FAST],
      forgetWindows: false, prune: [],
    });
    expect(record.skipped, 'the integration config never ran, so its skip stands').toEqual(['tests/other.integration.spec.ts']);
  });

  it('sorts costs so the file a run writes does not depend on the order vitest reported', () => {
    const { record } = settle({
      previous: undefined,
      costs: { 'tests/z.spec.ts': 1, 'tests/a.spec.ts': 2 },
      skipped: [],
      measuredFiles: ['tests/a.spec.ts', 'tests/z.spec.ts'],
      forgetWindows: false, prune: [],
    });
    expect(Object.keys(record.costs)).toEqual(['tests/a.spec.ts', 'tests/z.spec.ts']);
  });
});

describe('an unrecognised flag is refused rather than dropped', () => {
  const DIRS = ['repo-checks', 'abuddy-cli'];

  // The one that mattered: `--drry` used to parse as nothing, so a run asked to write nothing measured the
  // suite and rewrote the record. Silence is the wrong answer for every flag, and worst for this one
  it('refuses a misspelled flag, naming the ones there are', () => {
    expect(() => parseArgs(['--update', '--drry'], DIRS)).toThrow(/No such flag: --drry[\s\S]*--dry/);
    expect(() => parseArgs(['--update', '--forse'], DIRS)).toThrow(/No such flag: --forse/);
    expect(() => parseArgs(['--update', '--sute', 'repo-checks'], DIRS)).toThrow(/No such flag: --sute/);
  });

  it('refuses `--suite=x`, whose value it would otherwise look for in the next argument', () => {
    expect(() => parseArgs(['--update', '--suite=repo-checks'], DIRS)).toThrow(/No such flag: --suite=repo-checks/);
  });

  // Derived from the declaration rather than a second list: a flag the parser handles and this does not know
  // about would be refused by the command that defines it, which is the failure this pair can have
  it('accepts every flag it declares', () => {
    // Two flags need a companion to be valid at all: `--suite` takes a value, and `--forget` takes `--all`,
    // because forgetting only what one run measured leaves a record of mixed vintages. The case asks whether
    // a declared flag parses in its valid form, not whether it parses alone
    const COMPANION: Partial<Record<string, string[]>> = {
      suite: ['--suite', 'repo-checks'],
      forget: ['--forget', '--all'],
    };
    for (const flag of SPEC_COST_FLAGS) {
      const argv = COMPANION[flag] ?? [`--${flag}`];
      expect(() => parseArgs(argv, DIRS), `--${flag} is declared, so it must parse`).not.toThrow();
    }
  });

  /**
   * `--forget` takes a scope that *measures*, which is narrower than the flag it rode on and wider than the
   * `--all` it then required.
   *
   * Requiring `--all` made correcting one spec mean discarding every window in the repo — the reason to reach
   * for the widest flag when the narrow thing was wanted. The recorded objection, that a partial forget leaves
   * two vintages, does not hold: a record already holds them, since `--all` appends only where a reading
   * disagrees and a bare update measures only what the check reports.
   *
   * What it does refuse is a forget that would reach nothing. Forgetting needs a reading to replace the window
   * with, and `--suite` alone drives no measurement on a current record — so it would report success having
   * forgotten nothing, which is the shape this repo refuses everywhere else.
   */
  it('takes any scope that measures, and refuses one that would forget nothing', () => {
    expect(() => parseArgs(['--forget', '--all'], DIRS), 'the whole repo').not.toThrow();
    expect(() => parseArgs(['--forget', '--all', '--suite', 'repo-checks'], DIRS), 'one suite').not.toThrow();
    expect(() => parseArgs(['--forget', 'packages/repo-checks/tests/a.spec.ts'], DIRS), 'one spec').not.toThrow();

    expect(() => parseArgs(['--forget'], DIRS), 'no scope at all').toThrow(/scope that measures/);
    expect(() => parseArgs(['--forget', '--suite', 'repo-checks'], DIRS),
      '--suite alone measures only what is stale, so it would forget nothing').toThrow(/forget nothing/);
  });
});

describe('which suites an invocation acts on', () => {
  const DIRS = ['repo-checks', 'abuddy-cli', 'abuddy-sdk'];
  const spec = (dir: string): string => `packages/${dir}/tests/a.spec.ts`;

  it('is all of them when nothing narrows it', () => {
    expect(suitesFor(DIRS, undefined, [])).toEqual(DIRS);
  });

  it('is the one --suite names', () => {
    expect(suitesFor(DIRS, 'abuddy-cli', [])).toEqual(['abuddy-cli']);
  });

  it('is the suite a named path belongs to', () => {
    expect(suitesFor(DIRS, undefined, [spec('abuddy-sdk')])).toEqual(['abuddy-sdk']);
  });

  // The invariant the command could not reach: it used to AND these two filters and then report "every
  // record is current" over the empty result, a claim about suites it had never read. `parseArgs` refuses
  // the contradiction that produced it, and this is the other half — valid arguments always select something
  it('never selects nothing, for any arguments parseArgs accepts', () => {
    for (const only of [undefined, ...DIRS]) {
      for (const named of [[], [spec('repo-checks')], [spec('abuddy-cli')]]) {
        const accepted = ((): boolean => {
          try {
            parseArgs(['--update', ...(only ? ['--suite', only] : []), ...named], DIRS);
            return true;
          } catch { return false; }
        })();
        if (!accepted) continue;
        expect(suitesFor(DIRS, only, named), `--suite ${only} with ${named.join(' ') || 'no path'}`).not.toHaveLength(0);
      }
    }
  });

  it('reads the list it is given', () => {
    expect(suitesFor(DIRS.filter((dir) => dir !== 'abuddy-sdk'), undefined, [spec('abuddy-sdk')])).toEqual([]);
  });

  it('takes a named path apart into the suite it is in and the path within it', () => {
    expect(namedIn('repo-checks', [spec('repo-checks'), spec('abuddy-cli')])).toEqual(['tests/a.spec.ts']);
    expect(namedIn('abuddy-sdk', [spec('repo-checks')])).toEqual([]);
  });
});

describe('a named spec that is not there is refused, whatever was asked of it', () => {
  const FILES = ['tests/a.spec.ts', 'tests/b.spec.ts'];

  it('names the ones that are absent', () => {
    expect(absentIn(FILES, ['tests/a.spec.ts', 'tests/nope.spec.ts'])).toEqual(['tests/nope.spec.ts']);
    expect(absentIn(FILES, FILES)).toEqual([]);
  });

  it('says so with the path as the caller wrote it', () => {
    expect(() => refuseAbsent('mini', FILES, ['tests/nope.spec.ts']))
      .toThrow(/not specs in mini[\s\S]*packages\/mini\/tests\/nope\.spec\.ts/);
    expect(() => refuseAbsent('mini', FILES, FILES)).not.toThrow();
  });

  // The command validates every named path here rather than inside a mode's per-suite loop. In the loop it
  // reported the first suite's typo and the second only once that was fixed — and `check` accumulates every
  // other kind of problem across all twelve suites before reporting, so it contradicted itself.
  it('collects the absent paths from every suite they reach into, not the first', () => {
    const dirs = UNIT_SUITES.map((suite) => suite.dir);
    // Two adjacent suites the unit-suite list holds out of alphabetical order, derived: naming them would
    // fail this case about a renamed suite rather than about the behaviour, and taking the first two would
    // make the sort unobservable — those happen to be in order already, so the assertion below held with the
    // sort removed and watched nothing
    const at = dirs.findIndex((dir, index) => index + 1 < dirs.length && dir > dirs[index + 1]!);
    expect(at, 'no two adjacent suites are out of order, so this could not see the sorting').toBeGreaterThan(-1);
    const named = [dirs[at]!, dirs[at + 1]!].map((dir) => `packages/${dir}/tests/nope.spec.ts`);

    const found = absentNamed(REPO_ROOT, dirs, named);
    expect(found, 'both, so one run names every typo').toHaveLength(2);
    expect(found, 'sorted for the reader').toEqual([...named].sort());
    expect(found, 'which is not the order the suites were given in').not.toEqual(named);
  });

  it('names only the paths that are absent', () => {
    const dirs = UNIT_SUITES.map((suite) => suite.dir);
    const dir = dirs[0]!;
    const real = `packages/${dir}/${specFiles(path.join(REPO_ROOT, 'packages', dir))[0]!}`;
    const nope = `packages/${dir}/tests/nope.spec.ts`;
    expect(absentNamed(REPO_ROOT, dirs, [real, nope])).toEqual([nope]);
    expect(absentNamed(REPO_ROOT, dirs, [real]), 'a real spec is not a problem').toEqual([]);
  });

  // Asserts the answer, not the shortcut above it: that `named.length === 0` returns before walking twelve
  // trees is a cost guard, and nothing here would fail if it went
  it('has nothing to report when no path was named', () => {
    expect(absentNamed(REPO_ROOT, UNIT_SUITES.map((suite) => suite.dir), [])).toEqual([]);
  });

  // Why `check` narrows `unrecorded` and `misplaced` but never `stale`: `stale` answers "recorded and no
  // longer on disk" from the file list it is given, so over a narrowed list every spec the caller did not
  // name reads as gone. Narrowing the whole loop's file list is the obvious simplification and is wrong.
  it('is why the recorded-but-gone question is only ever asked of a whole suite', () => {
    const record = withCosts({ measuredAt: '', skipped: [], unmeasured: [], machine: thisMachine(), samples: { 'tests/a.spec.ts': [1], 'tests/b.spec.ts': [2] } });
    expect(stale(record, FILES), 'nothing is gone').toEqual([]);
    expect(stale(record, ['tests/a.spec.ts']), 'but against one named spec, the other reads as gone')
      .toEqual(['tests/b.spec.ts']);
  });
});

describe('when a run is refused as a measurement of the machine', () => {
  const loaded = { hasPrevious: true, force: false, moved: 6, comparable: 20 };

  it('refuses a run that moved more of the suite than a measurement should', () => {
    expect(refusesAsContended(loaded)).toBe(true);
  });

  it('is suppressed by --force, which is the user saying the suite really did change', () => {
    expect(refusesAsContended({ ...loaded, force: true })).toBe(false);
  });

  // `--all` suppressed it while this counted rewrites rather than movements, and the input went with that.
  // The case is kept the other way up: a correlated drift moves nothing the tolerance sees, so the run the
  // bypass existed for never reached here, and a quarter of a suite each past its own threshold is a loaded
  // machine whichever flags the run carries
  it('takes no account of --all, which does not change what moved', () => {
    expect(Object.keys(loaded), 'the flag is not one of its inputs').not.toContain('all');
    expect(refusesAsContended({ ...loaded, force: true }), 'and --force is still the way past it').toBe(false);
  });

  /**
   * The gap a second, earlier check exists for.
   *
   * This one asks *did too much move*, which it can only ask after measuring — and an addition has not
   * moved, so a run whose every spec is new is never refused however loaded the machine was. That is
   * exactly how a cost got recorded at a load of 71 and had to be reverted by hand. `spec-cost.ts` now
   * refuses on measured idle *before* it runs anything; these are two different questions and both are kept.
   */
  it('cannot fire for a run that only added specs, whatever the machine was doing', () => {
    expect(refusesAsContended({ ...loaded, moved: 0, comparable: 0 }), 'nothing had a value to move from')
      .toBe(false);
    const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts/spec-cost.ts'), 'utf-8');
    expect(source, 'so the command checks the machine before measuring').toContain('refusesAsBusy(');
    expect(source.indexOf('refusesAsBusy('), 'and does it before, not after')
      .toBeLessThan(source.indexOf('refusesAsContended('));
  });

  it('never fires for a suite with no record to have moved', () => {
    expect(refusesAsContended({ ...loaded, hasPrevious: false })).toBe(false);
    expect(refusesAsContended({ hasPrevious: true, force: false, moved: 0, comparable: 0 })).toBe(false);
  });
});

/**
 * What `--all` buys and what it costs, which are not the same question.
 *
 * Re-measuring everything is always what the flag asks for. *Forgetting* everything is a second thing, and
 * it takes `--forget`. It replaced `rewritesEveryRow`, which was `all && drifted(body)`: a drift gate on a
 * write, needed only while the record held one number per spec and rewriting it on a quiet run was churn. A
 * window drops an agreeing reading by itself, so there is nothing left for a threshold to protect.
 *
 * **It must not ride on `--force`, which would put the riskiest write behind the flag that silences the
 * guards.** `--force` overrides `refusesAsBusy` and `refusesAsContended`; forgetting discards every window and
 * writes each cost from a single reading, which is the state with no history to outvote a bad one. Gated there,
 * the one operation that most needs a quiet machine is the only one that cannot be refused for a loud one.
 * `adopt` is `--all --force`, and that is a different question — whose machine the record is, not whether its
 * readings still describe the code.
 */
describe('a window is forgotten only when asked for outright', () => {
  it('forgets the history on --all --forget', () => {
    expect(forgetsWindows({ all: true, forget: true })).toBe(true);
  });

  it('leaves the history alone for either flag on its own', () => {
    expect(forgetsWindows({ all: true, forget: false }), '--all re-measures and appends').toBe(false);
    expect(forgetsWindows({ all: false, forget: true }), 'and --forget needs the whole suite').toBe(false);
    expect(forgetsWindows({ all: false, forget: false })).toBe(false);
  });

  /**
   * And `--force` does not forget, which is the finding this closes.
   *
   * It overrides the idle and contention refusals, so gating the forget on it meant the write that most
   * needs a quiet machine was the one that could not be refused for a loud one.
   */
  it('is not what --force asks for, since that silences the refusals forgetting most needs', () => {
    expect(forgetsWindows({ all: true, forget: false, force: true } as never)).toBe(false);
  });

  // The coupling that is gone, and the reason it can be: the warning used to advise a flag whose write was
  // gated on the same threshold, so the two had to agree about what a drift was. Now the advice is
  // unconditional, so a reader who follows it always gets the effect it describes.
  it('answers the same for every body a run could report, drifted or not', () => {
    const bodies = [0.25, -0.25, 0.03, undefined];
    expect(bodies.map(drifted), 'the bodies span both sides of the threshold')
      .toEqual([true, true, false, false]);
    // The old flag's answer was `drifted(body)`, so this list used to produce two different answers. One
    // answer for all four is the independence, and it is what makes the drift advice unconditionally true.
    expect([...new Set(bodies.map(() => forgetsWindows({ all: true, forget: true })))]).toEqual([true]);
  });
});

/**
 * A crossing one agreeing reading away, which is the window's other half: the old record discovered these
 * as a gate failure, and this is the run that says so first.
 */
describe('a crossing is reported before it is adopted', () => {
  const FAST = 'tests/x.spec.ts';

  /**
   * Both commands report it, and `check` is the one that matters.
   *
   * Printed by `update` alone it tells the person who has just measured — and already knows — while saying
   * nothing to the one whose chain fails three weeks later, who is the reader a warning a run early is *for*.
   * Asserted over the command's text, which is how this file already checks that `refusesAsBusy` runs before
   * the measurement: `check` and `update` are commands rather than functions, so their wiring is not reachable
   * any other way.
   */
  it('is reported by check and not only by the run that measured it', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts/spec-cost.ts'), 'utf-8');
    const check = source.indexOf('function check(');
    expect(check, 'the command this is about').toBeGreaterThan(-1);

    const calls = [...source.matchAll(/provisional\(/g)].map((hit) => hit.index!);
    expect(calls.length, 'one in update, one in check').toBeGreaterThanOrEqual(2);
    expect(calls.some((at) => at > check), 'check reports a crossing that is one reading away').toBe(true);
    expect(calls.some((at) => at < check), 'and so does the run that would cause it').toBe(true);
  });

  it('names the reading, the median and where it would go', () => {
    expect(provisional(FAST, appendSample([2_041], 2_791))).toEqual({
      file: FAST, reading: 2_791, median: 2_041, belongs: 'integration',
    });
  });

  it('says nothing while the latest reading agrees with where the spec is', () => {
    expect(provisional(FAST, [2_041, 2_100])).toBeUndefined();
  });

  // Once the median has crossed it is no longer provisional — it is the gate's business, and saying both
  // would tell a reader to wait for a confirmation that has already happened
  it('stops once the median has adopted it', () => {
    expect(provisional(FAST, [4_000, 4_000])).toBeUndefined();
  });

  it('says nothing about a window of one, which has nothing to confirm', () => {
    expect(provisional(FAST, [9_999])).toBeUndefined();
  });
});
