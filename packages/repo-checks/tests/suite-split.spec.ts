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
  FAST_BELOW_MS, INTEGRATION_ABOVE_MS, SPEC_COST_FLAGS, absentIn, changesIn, contended, drift, drifted,
  absentNamed, describeBudget, EXPENSIVE_BY_NATURE, halfOfPath, moved, namedIn, overBudget, parseArgs,
  planFor, readSpecCost,
  refuseAbsent, refusesAsContended, rewritesEveryRow, settle, specCostFile, specFiles, stale, suitesFor,
  unrecorded,
} from '../../../scripts/lib/spec-cost.ts';
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

describe('a spec runs in the half its cost puts it in', () => {
  it(`moves a fast spec above ${INTEGRATION_ABOVE_MS}ms, and brings an integration one back below ${FAST_BELOW_MS}ms`, () => {
    const wrong = suites
      .filter(({ record }) => record)
      .flatMap(({ suite, dir, record, files }) => overBudget(dir, record!.costs, files)
        .filter((found) => found.kind === 'rename')
        .map((found) => `${suite.dir}/${found.file} costs ${(found.ms / 1000).toFixed(1)}s, which is ${found.belongs}, but it is in the ${halfOfPath(found.file)} half`));
    expect(wrong, 'rename these, or re-measure if the cost has genuinely changed').toEqual([]);
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
    const total = fast.reduce((sum, file) => sum + (cli.record?.costs[file] ?? 0), 0);
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
  const RENAME = { kind: 'rename', file: 'tests/slow.spec.ts', ms: 9_000, belongs: 'integration' } as const;

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

  it('says nothing at all when there is nothing to say', () => {
    expect(describeBudget([], 'any-suite')).toEqual({ tail: '', lines: [], advice: '' });
  });
});

describe('a spec that costs more than a fast half allows', () => {
  // No `!split` filter: `overBudget` returns this kind only for a package that has nowhere to move a spec
  // to, which is the same question, asked once, in the one place that cannot forget to ask it
  const found = () => suites
    .filter(({ record }) => record)
    .flatMap(({ suite, dir, record, files }) => overBudget(dir, record!.costs, files)
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

  it('records a spec it has never seen', () => {
    expect(moved(FAST, undefined, 120)).toBe(true);
  });

  it('records a measurement that would place the spec in the other half', () => {
    expect(moved(FAST, 2_400, 2_600), 'a fast spec past the upper edge').toBe(true);
    expect(moved(SLOW, 2_600, 1_400), 'an integration spec under the lower edge').toBe(true);
  });

  it('records a large move that crosses nothing, so the number stays roughly true', () => {
    expect(moved(FAST, 400, 1_200)).toBe(true);
  });

  // The case the tolerance exists for: `generated-behind-contract` runs codegen over a temp pack and reads
  // anywhere in this range between idle runs. Both values are far below the band and neither says anything
  // the other does not, and recording each of them rewrote the file on every update.
  it('keeps the record for jitter in a spec that is simply variable', () => {
    expect(moved(FAST, 995, 714)).toBe(false);
    expect(moved(FAST, 714, 995)).toBe(false);
  });
});

describe('a run that moved too much was measuring the machine', () => {
  const specs = (n: number, prefix: string): string[] => Array.from({ length: n }, (_, i) => `tests/${prefix}${i}.spec.ts`);

  // The regression: `moved` is true for a spec with no recorded value, so counting additions read eight new
  // specs in a suite of twenty-eight as a contended run and refused it, naming the machine.
  it('does not read specs measured for the first time as a machine under load', () => {
    const previous = { measuredAt: '', skipped: [], costs: Object.fromEntries(specs(20, 's').map((spec) => [spec, 100])) };
    const measured = [...specs(20, 's'), ...specs(8, 'new')];
    const settled = { ...previous.costs, ...Object.fromEntries(specs(8, 'new').map((spec) => [spec, 50])) };
    const { added, moved: movedSpecs, rewritten } = changesIn(previous, settled, measured);
    expect(added, 'the eight new ones').toHaveLength(8);
    expect(movedSpecs, 'and nothing that had a value moved').toHaveLength(0);
    expect(rewritten, 'nor was any of their rows rewritten').toHaveLength(0);
    expect(contended(movedSpecs.length, measured.length - added.length)).toBe(false);
  });

  it('reads a suite whose recorded specs mostly moved as one', () => {
    expect(contended(6, 20)).toBe(true);
  });

  it('never refuses a suite that had nothing to compare against', () => {
    expect(contended(0, 0), 'a record written for the first time').toBe(false);
  });
});

describe('a run that moved as a body has drifted, however little each spec moved', () => {
  const record = (costs: Record<string, number>) => ({ measuredAt: '', skipped: [], costs });
  const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`tests/s${i}.spec.ts`, 100]));

  // The case the per-spec tolerance cannot see: a fifth added to everything stays under every individual
  // threshold, so nothing re-records and the total silently stops being true
  it('sees a uniform slowdown that no single spec would report', () => {
    const measured = Object.fromEntries(Object.entries(twenty).map(([spec, ms]) => [spec, ms * 1.2]));
    expect(Object.values(measured).every((ms) => !moved('tests/x.spec.ts', 100, ms)),
      'and not one of them moved on its own').toBe(true);
    expect(drift(record(twenty), measured)).toBeCloseTo(0.2, 5);
    expect(drifted(drift(record(twenty), measured)), 'so the body is what reports it').toBe(true);
  });

  it('cancels jitter that falls both ways', () => {
    const measured = Object.fromEntries(Object.entries(twenty).map(([spec, ms], i) => [spec, i % 2 ? ms * 1.3 : ms * 0.7]));
    expect(drifted(drift(record(twenty), measured)), 'which is jitter, not a slowdown').toBe(false);
  });

  // Undefined and not 0: the caller prints the fragment only when there is one, because `body +0%` reads as
  // "steady" where the answer is "nothing to compare against"
  it('reads nothing from a run that measured nothing, rather than dividing by it', () => {
    expect(drift(record(twenty), {})).toBeUndefined();
    expect(drift(undefined, twenty)).toBeUndefined();
    expect(drifted(undefined), 'and nothing to compare is not a drift to warn about').toBe(false);
  });

  it('ignores specs the record has never seen, which have nothing to have drifted from', () => {
    expect(drift(record(twenty), { 'tests/new.spec.ts': 9_000 })).toBeUndefined();
    expect(drift(record(twenty), { ...twenty, 'tests/new.spec.ts': 9_000 }), 'and reads the rest as steady')
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
    write(specCostFile(DIR), `${JSON.stringify({ measuredAt: 'then', costs, skipped }, null, 2)}\n`);

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-cost-'));
    write(`packages/${DIR}/vitest.config.ts`, 'export default {};\n');
    write(`packages/${DIR}/tests/a.spec.ts`, '');
    write(`packages/${DIR}/tests/b.spec.ts`, '');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

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
  const previous = (costs: Record<string, number>, skipped: string[] = []) =>
    ({ measuredAt: 'then', costs, skipped });

  // The defect: the newly-skipped filter read the *settled* costs, which start as everything the record
  // already held — so a spec that had a cost and stopped running was filtered out of `skipped` and kept the
  // cost it no longer has, and the record claimed a duration for a file that ran nothing
  it('drops the cost of a spec that has stopped running, and records it as skipped', () => {
    const { record } = settle({
      previous: previous({ [FAST]: 1_200, 'tests/b.spec.ts': 800 }),
      costs: { 'tests/b.spec.ts': 810 },
      skipped: [FAST],
      measuredFiles: [FAST, 'tests/b.spec.ts'],
      rewriteAll: false, prune: [],
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
      previous: before, costs: { [FAST]: 1_050 }, skipped: [], measuredFiles: [FAST], rewriteAll: false, prune: [],
    });
    expect(added).toHaveLength(0);
    expect(movedSpecs, 'inside the tolerance, so nothing was recorded').toHaveLength(0);
    expect(record).toEqual(before);
  });

  // The reason the drift warning's advice works: the same measurement, two answers. Without it a record that
  // was uniformly stale stayed uniformly stale however many times you ran `--all`, because every delta sat
  // under its own threshold and the settling discarded each one
  it('rewrites a row the tolerance would have kept, and keeps it otherwise', () => {
    const inputs = { previous: previous({ [FAST]: 1_000 }), costs: { [FAST]: 1_050 }, skipped: [],
      measuredFiles: [FAST], prune: [] };
    expect(moved(FAST, 1_000, 1_050), 'a move the tolerance is there to absorb').toBe(false);
    expect(settle({ ...inputs, rewriteAll: false }).record.costs[FAST]).toBe(1_000);
    expect(settle({ ...inputs, rewriteAll: true }).record.costs[FAST]).toBe(1_050);

    // And it says which of the two it did. One word for both read a run that rewrote the file as a suite
    // that had got slower, so the report can only be honest if the two are counted apart.
    const written = settle({ ...inputs, rewriteAll: true });
    expect(written.rewritten, 'the row was rewritten').toEqual([FAST]);
    expect(written.moved, 'but nothing moved, and the report must not say it did').toEqual([]);
  });

  // What the default path lets the report rely on: unless every row is being rewritten the two are one set,
  // so the line that prints the difference prints nothing and the common output is untouched by it
  it('rewrites a row only for a movement otherwise', () => {
    const SLOW = 'tests/slow.spec.ts';
    const inputs = { previous: previous({ [FAST]: 1_000, [SLOW]: 1_000 }), skipped: [],
      measuredFiles: [FAST, SLOW], prune: [], rewriteAll: false };
    const { moved: movedSpecs, rewritten } = settle({ ...inputs, costs: { [FAST]: 1_050, [SLOW]: 4_000 } });
    expect(rewritten, 'the one the tolerance kept').toEqual([SLOW]);
    expect(movedSpecs, 'and the two sets are one').toEqual(rewritten);
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
      rewriteAll: false, prune: [],
    });
    expect(added, 'nothing was measured for the first time').toHaveLength(0);
    expect(movedSpecs, 'and no cost moved').toHaveLength(0);
    expect(record.costs, 'so the costs are untouched').toEqual(before.costs);
    expect(record.skipped).toEqual(['tests/needs-a-binary.spec.ts']);
    expect(record.measuredAt, 'but the record changed, so it is dated').not.toBe('then');
  });

  it('records a measurement that says something new, and dates it', () => {
    const { record, moved: movedSpecs, rewritten } = settle({
      previous: previous({ [FAST]: 1_000 }), costs: { [FAST]: 4_000 }, skipped: [], measuredFiles: [FAST], rewriteAll: false, prune: [],
    });
    expect(movedSpecs).toEqual([FAST]);
    expect(rewritten, 'a movement is a rewrite too').toEqual([FAST]);
    expect(record.costs[FAST]).toBe(4_000);
    expect(record.measuredAt).not.toBe('then');
  });

  it('drops a pruned spec from both halves of the record', () => {
    const { record } = settle({
      previous: previous({ [FAST]: 100, 'tests/gone.spec.ts': 200 }, ['tests/also-gone.spec.ts']),
      costs: { [FAST]: 100 },
      skipped: [],
      measuredFiles: [FAST],
      rewriteAll: false, prune: ['tests/gone.spec.ts', 'tests/also-gone.spec.ts'],
    });
    expect(Object.keys(record.costs)).toEqual([FAST]);
    expect(record.skipped).toEqual([]);
    expect(record.measuredAt, 'a prune changed the record').not.toBe('then');
  });

  // What the report line reads. It used to enumerate its own reasons — costs moving, specs arriving, rows
  // pruned — so a spec that stopped running rewrote the file and printed "none moved"; the `N skipped` beside
  // it is the total, identical whether the skip is new or carried, so nothing on the line said otherwise.
  it('names a spec that lost its cost, which is neither a move nor an arrival nor a prune', () => {
    const { dropped, added, rewritten } = settle({
      previous: previous({ [FAST]: 1_200, 'tests/b.spec.ts': 800 }),
      costs: { 'tests/b.spec.ts': 800 },
      skipped: [FAST],
      measuredFiles: [FAST, 'tests/b.spec.ts'],
      prune: [],
      rewriteAll: false,
    });
    expect(dropped, 'the run has to report this, or it reports nothing at all').toEqual([FAST]);
    expect([...added, ...rewritten], 'and it is neither of the two that were counted').toEqual([]);
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
      rewriteAll: false,
    });
    expect(dropped).toEqual([]);
  });

  it('keeps a skip recorded for a half this run did not measure', () => {
    const { record } = settle({
      previous: previous({ [FAST]: 100 }, ['tests/other.integration.spec.ts']),
      costs: { [FAST]: 100 },
      skipped: [],
      measuredFiles: [FAST],
      rewriteAll: false, prune: [],
    });
    expect(record.skipped, 'the integration config never ran, so its skip stands').toEqual(['tests/other.integration.spec.ts']);
  });

  it('sorts costs so the file a run writes does not depend on the order vitest reported', () => {
    const { record } = settle({
      previous: undefined,
      costs: { 'tests/z.spec.ts': 1, 'tests/a.spec.ts': 2 },
      skipped: [],
      measuredFiles: ['tests/a.spec.ts', 'tests/z.spec.ts'],
      rewriteAll: false, prune: [],
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
    for (const flag of SPEC_COST_FLAGS) {
      const argv = flag === 'suite' ? ['--suite', 'repo-checks'] : [`--${flag}`];
      expect(() => parseArgs(argv, DIRS), `--${flag} is declared, so it must parse`).not.toThrow();
    }
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
    const record = { measuredAt: '', skipped: [], costs: { 'tests/a.spec.ts': 1, 'tests/b.spec.ts': 2 } };
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
 * Re-measuring everything is always what the flag asks for. Rewriting everything is only worth the churn
 * against a drift the per-spec tolerance cannot record, so the two are decided apart.
 */
describe('every row is rewritten only against a drift that no single row would report', () => {
  it('clears a body the tolerance cannot see', () => {
    expect(rewritesEveryRow({ all: true, body: 0.25 })).toBe(true);
    expect(rewritesEveryRow({ all: true, body: -0.25 }), 'in either direction').toBe(true);
  });

  // The churn this exists to stop: measured 2026-09-28, an `--all` run on a current record rewrote 26 of 28
  // rows at a body of -3%, which is jitter overwriting jitter and is what the tolerance is for
  it('leaves a quiet run alone, however it was asked for', () => {
    expect(rewritesEveryRow({ all: true, body: 0.03 })).toBe(false);
    expect(rewritesEveryRow({ all: true, body: undefined }), 'and nothing to compare is not a drift').toBe(false);
  });

  it('never fires without the flag, so a default run still settles every row', () => {
    expect(rewritesEveryRow({ all: false, body: 0.25 })).toBe(false);
  });

  // The threshold is one declaration, not two: a drift this reads as worth clearing is exactly one the run
  // reports, so the warning cannot advise `--all` for a body the flag would then decline to record
  it('fires on exactly the drifts the run warns about', () => {
    for (const body of [0.25, -0.25, 0.03, undefined]) {
      expect(rewritesEveryRow({ all: true, body }), `body ${body}`).toBe(drifted(body));
    }
  });
});
