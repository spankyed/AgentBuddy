/**
 * A unit pool's per-project cache: where a project's stamp lives and what it is a fingerprint of.
 *
 * The definition, not the command — `scripts/test-unit-pool.ts` is the command over it, the same split as
 * `scripts/ensure-packages-built.ts` over `@abuddy/host/build/packages-built`. It is a module of its own for
 * one reason: the guard in `chain-inputs.spec.ts` has to read what the pool actually fingerprints, and the
 * pool script runs its `main()` on import, so a spec cannot ask it.
 *
 * Both this and the chain's pool step derive from `suiteInputs`, whose doc carries the rule the pair of
 * caches holds to and what happened when it did not.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { diffableStamp, REPO_ROOT, stampedRunAll, type BuildUnit, type StampedUnit } from '@abuddy/host/build/packages-built';
import { INTEGRATION_SUITES, suiteInputs } from './chain-steps.ts';
import { CONFIG_BY_HALF, hasSplit, type Half } from './spec-halves.ts';
import { UNIT_SUITES, type UnitSuite } from './unit-suites.ts';
import type { ReportedRun } from './spec-durations-reporter.ts';
import { asDuration, cachedDurations, costliestFiles, costOf, halfBound, halfTotal, markedSpecs, outlierIn, placementOf, readDurationRuns, trendIn, uncheckedNote, UNMARKED_NOTE, type FileDuration } from './spec-durations.ts';

/**
 * Beside the package builds' and the chain's stamps, in the same cache directory and the same format, so one
 * `fingerprintUnit` and one reader cover all three.
 */
export const POOL_STAMP_DIR = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-unit-pool');

/**
 * Keyed by directory **and half**, because a suite with two halves has two things to remember.
 *
 * A suite with an integration config runs twice over one input set, and the two runs are not interchangeable:
 * its fast half can have passed while its expensive half never has. One path for both would let the second be
 * skipped on the first's record, which is the hole that kept the integration half from being pooled at all.
 *
 * **The path is where a record is kept, not what says which record it is** — that is the command in
 * `poolUnitFor`'s fingerprint, below. The half is in the path as well so that a reader of the cache
 * directory can tell the two files apart, and the provenance for the same reason: a chain pass and a lone
 * pass are two things to remember about one suite, exactly as its two halves are.
 */
export const poolStampFor = (suite: UnitSuite, half: Half, provenance: Provenance): string =>
  path.join(POOL_STAMP_DIR, `${suite.dir}.${half}.${provenance}.json`);

/**
 * This module's export that names a stamp, beside `packages-built.ts`'s three.
 *
 * Two declarations rather than one shared list, because each belongs beside the functions it names: a
 * stamp reader added here is in view of whoever adds it, which a central list two files away is not.
 */
export const STAMP_READERS = { poolStampFor } as const;

/**
 * Set on a run whose verdict must not be recorded, and read here because this is where the records are kept.
 *
 * The chain's classification re-run is the one that needs it. A step that fails while the machine is busy is
 * run again alone, to tell contention from the code, and `chain.ts` deliberately writes no step stamp for that
 * re-run: *a step that passes alone has not passed the chain*, so the next chain does it again under
 * concurrency — the only condition that can reproduce the failure.
 *
 * **That promise does not survive a step that keeps a cache of its own, and a pool is one.** Read off the
 * stamps on 2026-10-02: `test:unit:host` failed sharing the machine, the re-run passed and wrote all eleven
 * project stamps at 15:20:10, the chain refused the step stamp as designed, and the next chain's step then ran
 * **zero tests** in 0.8s and recorded success at 15:20:15. Nothing stale was left for it to run, so the thing
 * that had failed was never attempted again, and the chain reported green over it. A green-on-retry nobody
 * sees is what the refusal exists to prevent; one level down, it was being recorded anyway.
 *
 * **Builds are deliberately not suppressed.** `ensurePackagesBuilt`'s stamps are read as a *precondition* by
 * other processes in the same run — `packagesBuiltOrRefuse` at every suite's collection — so a build that
 * happened and did not record it turns the re-run into a refusal about stale packages, which fails about the
 * wrong thing. A build records a fact about files, which is true whoever asked for it; this suppresses a
 * verdict about behaviour, which is the chain's to record and not a diagnostic's.
 */
export const DIAGNOSTIC_RUN_ENV = 'ABUDDY_DIAGNOSTIC_RUN';

/**
 * Set by the chain on every step it spawns, and read here because this is where the stamps are kept.
 *
 * **It exists because a pass established alone is not the pass the chain is looking for.** That rule is
 * already written for the chain's own classification re-run — *"a step that passes alone has not passed the
 * chain"* — and `DIAGNOSTIC_RUN_ENV` enforces it by recording nothing. But that signal is one the chain
 * sets, so it covers only the chain's retry. A person doing the same retry by hand is not covered, and the
 * sequence is three commands: `npm run test:unit:host` passes serially and writes eleven project stamps,
 * `npm run chain` finds its own step stamp stale and runs the pool, the pool finds every project fresh and
 * runs **zero tests**, and the step records green in 0.8s. Observed repeatedly on 2026-10-06. The suites
 * were never run under the concurrency that is the only condition reproducing what the chain was built to
 * catch — the birpc timeout a blocked worker causes, and the 5s default a crowded `tsc` crosses.
 *
 * A positive signal rather than another negative one: the chain is the thing that knows it is the chain,
 * and anything else running a pool is by definition running it some other way.
 */
export const CHAIN_RUN_ENV = 'ABUDDY_CHAIN_RUN';

/**
 * Under what conditions a pool run happened, as one declaration with the type derived from it.
 *
 * Two values because two is what has consumers, and the names are the claim each one makes: `chain` is a
 * pass under the chain's concurrency, `alone` is a pass by itself. A third would need a condition anything
 * distinguishes.
 */
export const PROVENANCES = ['chain', 'alone'] as const;
export type Provenance = (typeof PROVENANCES)[number];

/** Which kind of run this is. Anything that is not the chain is `alone`, including a pack author's. */
export const provenanceOf = (env: NodeJS.ProcessEnv = process.env): Provenance =>
  (env[CHAIN_RUN_ENV] === '1' ? 'chain' : 'alone');

/** Whether this run may record what it proved */
export const recordsVerdict = (env: NodeJS.ProcessEnv = process.env): boolean => env[DIAGNOSTIC_RUN_ENV] !== '1';

/**
 * The run, stamped where its verdict may be recorded and left unrecorded where it may not.
 *
 * One function rather than a branch at the call site, so the question is asked in the module that owns the
 * stamps and a spec can watch both answers without running a suite.
 */
export async function recordRun(
  units: readonly StampedUnit[],
  run: () => void | Promise<void>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // Existing stamps are left exactly as they are: `stampedRunAll` clears them before the run, and clearing
  // them here would make a diagnostic invalidate records it is not allowed to write either.
  if (!recordsVerdict(env)) {
    await run();
    return;
  }
  await stampedRunAll(units, run);
}

const projectArgs = (suites: readonly UnitSuite[]): string[] =>
  suites.flatMap((suite) => ['--project', suite.workspace]);

/**
 * The durations reporter, on every pool's invocation.
 *
 * `--reporter=default` goes with it because naming any reporter *replaces* the human output — the same
 * rule `scripts/spec.ts` handles for the count reporter. The pool names the destination in the
 * environment, so this path is stable and belongs in the fingerprint: a change to what the reporter
 * records is a change to what a run proves, which is exactly the kind of thing `poolUnitFor`'s command
 * text exists to notice.
 */
const REPORTER = path.join(REPO_ROOT, 'scripts', 'lib', 'spec-durations-reporter.ts');
const reporterArgs = (): string[] => ['--reporter=default', `--reporter=${REPORTER}`];

/**
 * The three pools: which half each one runs, which suites belong to it, and how it runs them.
 *
 * A pool is a resolution and a half, not a kind of test. `host` and `pack` split on resolution — Node
 * conditions are per process, so those two cannot share one — and `integration` splits on the half, which is
 * why it needs no third resolution: its suites *are* host suites, and what makes them a pool is that a second
 * config holds their expensive specs. `INTEGRATION_SUITES` derives that membership from those configs, so a
 * package that gains one joins this pool without an edit here.
 *
 * `run` is where they differ. Projects of one root config go to a single vitest with `--project`; a pack suite
 * is its own config resolving the published `dist`, so it can share a run with nothing — not even another pack
 * suite.
 *
 * Here rather than in the command, so a spec can ask which suites a pool covers and under which key. The
 * command runs its `main()` on import, which is the reason this module exists at all.
 */
export const POOLS = {
  host: {
    half: 'fast' as Half,
    suites: () => UNIT_SUITES.filter((suite) => suite.kind === 'host'),
    // with-source supplies the @abuddy/source condition the host suites resolve under
    run: (stale: readonly UnitSuite[]) => [{ suites: stale, command: 'node', args: ['scripts/with-source.mjs', 'npx', 'vitest', 'run', ...projectArgs(stale), ...reporterArgs()] }],
  },
  pack: {
    half: 'fast' as Half,
    suites: () => UNIT_SUITES.filter((suite) => suite.kind === 'pack'),
    // `--` so npm forwards the reporter flags to vitest rather than reading them itself
    run: (stale: readonly UnitSuite[]) => stale.map((suite) => ({ suites: [suite], command: 'npm', args: ['test', '-w', suite.workspace, '--', ...reporterArgs()] })),
  },
  integration: {
    half: 'integration' as Half,
    suites: () => INTEGRATION_SUITES,
    // The root integration config declares the condition itself, and carries the worker cap that makes this
    // pool faster at half the cores than at all of them
    run: (stale: readonly UnitSuite[]) => [{ suites: stale, command: 'npx', args: ['vitest', 'run', '--config', CONFIG_BY_HALF.integration, ...projectArgs(stale), ...reporterArgs()] }],
  },
} as const;

export type Pool = keyof typeof POOLS;

/**
 * Every stamp any pool would write, which is what makes the rest dead.
 *
 * Derived from `POOLS`, so a pool that loses a suite — or a key that changes shape, as it did when the half
 * joined it — leaves files nothing will ever read again. The chain prunes its own stamp directory for the same
 * reason (`pruneStamps`, `scripts/chain.ts`): a cache that only ever grows is one where a name collision with
 * something long gone is a silent pass.
 */
export const livePoolStamps = (): Set<string> => new Set(
  (Object.keys(POOLS) as Pool[]).flatMap((name) => POOLS[name].suites().flatMap((suite) =>
    PROVENANCES.map((provenance) => path.basename(poolStampFor(suite, POOLS[name].half, provenance))))),
);

/** Drops the stamps no pool would write. Every pool knows every pool's keys, so any run may do it. */
export function prunePoolStamps(): void {
  if (!fs.existsSync(POOL_STAMP_DIR)) return;
  const live = livePoolStamps();
  for (const file of fs.readdirSync(POOL_STAMP_DIR)) {
    if (file.endsWith('.json') && !live.has(file)) fs.rmSync(path.join(POOL_STAMP_DIR, file));
  }
}

/**
 * A project as a build unit, so it goes through the same freshness check as everything else.
 *
 * **Keyed by pool, and the command is why.** A suite with an expensive half is two units over one input set,
 * and until 2026-10-02 they hashed the same preimage — so a stamp read under the wrong key came out *fresh*,
 * which is the expensive half skipped on the fast half's record. `unitStaleReason` consults nothing but the
 * fingerprint, by design, since it recomputes its own side: the only place an identity can live is the
 * preimage, which is what `BuildUnit.command` is for.
 *
 * Pool rather than half, because `host` and `pack` are both the fast half and run differently. The text is what
 * it would take to run *this* suite alone in this pool, taken from the pool's own `run` so that nothing
 * restates how a pool runs: it does not vary with which other suites a given run found stale.
 *
 * So **a suite that moves pools re-runs**, being run a different way — where the stamp's path, keyed by the
 * half, would have called that the same record. Undo this and the two halves share one preimage again.
 *
 * **The provenance is in the preimage for the same reason**, and it is what keeps a lone pass out of the
 * chain's answer: the two runs hash differently, so the chain never reads a suite that passed by itself as
 * fresh, and a person's own loop goes on skipping what it has already run. Putting it only in the path
 * would not do it — `unitStaleReason` consults the fingerprint and nothing else, so a record found under
 * one name with the other's preimage comes back *fresh*, which is the defect the half was added to fix.
 */
export const poolUnitFor = (suite: UnitSuite, pool: Pool, provenance: Provenance): BuildUnit => ({
  inputs: suiteInputs(suite, POOLS[pool].half).map((input) => path.join(REPO_ROOT, input)),
  outputs: [],
  command: `${POOLS[pool].run([suite]).map(({ command, args }) => [command, ...args].join(' ')).join(' && ')} [${provenance}]`,
});

/**
 * The projects a run was asked for and did not report.
 *
 * **A `--project` filter that matches nothing is silently dropped**, as long as one other filter matched:
 * measured, `--project @abuddy/ears --project @abuddy/no-such-project` runs ears, ignores the second and
 * exits 0 with no warning. Only a filter matching *nothing at all* is an error. So a suite whose workspace
 * stopped matching its vitest project name would be stamped as having passed a run it was excluded from,
 * and would then stay cached — "recorded fresh having never run", through a different door.
 *
 * Checked rather than adapted to. Stamping only what reported would make the run "correct" while quietly
 * testing less, which is the failure being prevented, just smaller.
 *
 * **It reads the reporter's account, which closed two holes the console output could not.** Scraping the
 * labels meant handling both of vitest's spellings — `|name|` without colour, a space-padded coloured name
 * with it — and this repo had already shipped a version reading only the first, which reported all eleven
 * host projects absent from a run every one of them had passed. It also meant the answer was only
 * available for a multi-project run, because vitest prints no label otherwise, and a project that ran
 * *zero files* appeared in no output at all. The reporter names every project the run started
 * (`onTestRunStart`), so both of those are gone and there is no longer a case this cannot answer.
 */
export function projectsThatDidNotRun(asked: readonly string[], run: ReportedRun): string[] {
  const reported = new Set(run.projects);
  return asked.filter((project) => !reported.has(project));
}

/**
 * The one line a half gets when its slowest files stand apart from the rest of it.
 *
 * After the weight and the bound, before the ranking: it is a verdict *about* the ranking, so it reads as
 * one once the reader knows how heavy the half is. Silent where nothing stands out, which is every half in
 * this repo today — `outlierIn` carries what the thresholds are and what they were measured against.
 */
const outlierLines = (rows: readonly FileDuration[], half: Half, width: number, whole: boolean): string[] => {
  // **Only over a half this run measured whole.** "Out of line with its half" is unanswerable from part of
  // one: a pool runs the projects whose inputs moved, and a run covering a single suite's integration half
  // read 23.2s over 9.1s — 2.54x, and an artefact of the population rather than a file worth splitting.
  // Derived from which suites reported rather than a minimum file count, which would be a declared
  // population floor standing in for the question actually being asked.
  if (!whole) return [];
  const found = outlierIn(rows, half);
  if (found === undefined) return [];
  const named = found.above.map((row) => `${row.dir}/${row.file}`).join(', ');
  const sizes = found.above.map((row) => asDuration(row.ms)).join(' + ');
  return [`${`${found.ratio.toFixed(1)}x`.padStart(width)}  ${named} at ${sizes} against `
    + `${asDuration(found.belowMs)} — out of line with its half, so a candidate for splitting`];
};

/**
 * What a run says about its own `@slow:` markers, for whoever reports on a run that passed.
 *
 * **The reported half of the gate was computed and never printed.** `placementOf`'s `unmarked` list is a
 * report rather than a failure — load can push a file into a tail and never out of one — and the only
 * thing that printed it was the pool's own stdout, which both callers buffer and show only when a step
 * fails. So the direction deliberately left as a report was visible only when something else broke, which
 * is the one shape a partial result must not take: silent.
 *
 * **The files are named rather than counted**, because the ranking below cannot stand in for them. That is
 * ordered by cost and this list by test time (`slowestFiles`, the quantity the bar is taken over), so an
 * unmarked file in the tail need not be among the five rows a reader can see.
 *
 * Gated on a whole half exactly as `outlierLines` is, and for the same reason — the bar is this run's own
 * p90, so a partial run's is taken over whichever projects happened to be stale. Where it cannot speak it
 * says why, rather than leaving the half with no line.
 */
const placementLines = (rows: readonly FileDuration[], marked: ReadonlyMap<string, Map<string, string>>,
  half: Half, width: number, measured: number, all: number): string[] => {
  const placement = placementOf(rows, marked, { whole: measured === all });
  const unmarked = placement.unmarked.filter((row) => row.half === half);
  const unchecked = placement.unplaceable.find((one) => one.half === half);
  const lines: string[] = [];
  if (unmarked.length > 0) {
    const named = unmarked.map((row) => `${row.dir}/${row.file}`).join(', ');
    lines.push(`${String(unmarked.length).padStart(width)}  in the slow tail and unmarked: ${named}`
      + ` — ${UNMARKED_NOTE}`);
  }
  if (unchecked !== undefined) {
    lines.push(`${'—'.padStart(width)}  no @slow: marker checked here — `
      + uncheckedNote(unchecked.why, { files: unchecked.files, covered: measured, all }));
  }
  return lines;
};

/**
 * How many of this pool's `@slow:` markers guard a spec that could not move anyway.
 *
 * The gate's whole subject is whether a spec belongs in the other half, and `hasSplit` already records
 * what makes that available: *"a package with one config has nowhere to move a spec to."* Nothing counted
 * the markers against it, and the count is the finding — measured 2026-10-06, **every marker in the repo
 * is in such a package**, so the remedy the gate points at costs a new vitest config and a root project
 * entry rather than a rename.
 *
 * That is what this line is for. The gate carries a deletion condition turning on a year passing with no
 * spec having moved halves on its evidence, and while this number equals the marker count that year is
 * guaranteed to pass whatever anyone does — so the condition would be met by arithmetic rather than by
 * the gate having been found useless. A reader of a passing run should see which it was.
 *
 * Silent at zero, so the output stops mentioning it the moment a package gains a second half or a marker
 * lands in one of the three that already have one.
 */
const markerReachLines = (marked: ReadonlyMap<string, Map<string, string>>, width: number, root: string): string[] => {
  const dirs = [...marked].flatMap(([dir, files]) => [...files.keys()].map(() => dir));
  const stuck = dirs.filter((dir) => !hasSplit(path.join(root, 'packages', dir)));
  if (stuck.length === 0) return [];
  return [`${String(stuck.length).padStart(width)}  of ${dirs.length} @slow: marker(s) sit in a package with`
    + ' no second half, so no spec they guard can move without a new vitest config'];
};

/**
 * What a finished pool run measured, as lines for whoever reports on it.
 *
 * Here rather than in either caller because both need it and neither performed the run: `scripts/chain.ts`
 * and `scripts/test-unit.ts` each spawn a pool and buffer its output, printing it only on failure — so
 * until this existed the ranking the pool printed reached nobody running `npm run chain` or
 * `npm run test:unit`, which are the two commands anyone runs. It reads what the run *wrote* rather than
 * parsing what it printed, so there is nothing to keep in step with vitest.
 *
 * The half's total comes first because it is the number a ranking cannot give: measured 2026-10-05, the
 * five slowest files hold 46% of `repo-checks`' fast half and 97% of `abuddy-sdk`'s, and the shape no
 * top-five can show at all is many files each creeping a little — 349 of 388 fast-half files are under
 * 500ms and total 24.1s between them.
 *
 * **The root and the core count come from the caller**, defaulting to this repo and this box. Not for
 * flexibility — nothing passes anything else in production. It is what makes the lines below assertable:
 * a spec plants a cache under a temp root, names a core count, and reads back every line, which is
 * otherwise impossible for the most-read output in this subsystem. The partial-run guard in particular
 * rested on one hand-run check before this.
 *
 * **Only what the run being reported on actually measured**, which `since` is for. A pool runs the projects
 * whose inputs moved, so a step can run, find none of them stale and measure nothing — and a chain step in
 * exactly that state was observed returning in 0.8s and printing 17.3s of file time over 100 files that a
 * direct run minutes earlier had measured. True of the machine, and not of that step. A record older than
 * `since` is left out, so a partial run reports its own subset and a run that measured nothing reports
 * nothing.
 */
export function poolDurationLines(pool: Pool, width: number, since: Date,
  { root = REPO_ROOT, cores = os.availableParallelism() } = {}): string[] {
  const { half, suites } = POOLS[pool];
  const covered = suites();
  const rows = cachedDurations(root, covered, half, since);
  if (rows.length === 0) return [];
  const total = halfTotal(rows, half);
  const bound = halfBound(rows, half, cores);
  /** Which of the pool's suites this run actually measured, which is what says whether a half is whole */
  const measured = new Set(rows.map((row) => row.dir));
  const marked = new Map(covered.map((suite) => [suite.dir, markedSpecs(path.join(root, 'packages', suite.dir))]));
  const windows = new Map(covered.map((suite) => [suite.dir, readDurationRuns(root, suite.dir, half)]));
  return [
    `${asDuration(total.ms).padStart(width)}  ${half} half, ${total.files} file(s) this run measured`
      + `, ${asDuration(total.overheadMs)} of import and setup around them`,
    // Which of the two can bound the run, because a floor under `work/cores` cannot — and reading it the
    // other way is what split a 96-case file for no gain. `halfBound` carries that story.
    bound.binds === 'unknown'
      // No verdict rather than the wrong one: without overhead the work is understated, so the floor looks
      // binding when it is not — which is the reading that split a 96-case file for nothing
      ? `${asDuration(bound.perCoreMs).padStart(width)}  work/cores over a ${asDuration(bound.floorMs)} floor`
        + ` — which binds is unknown: ${bound.unmeasured} file(s) predate overhead, so re-run the pool`
      : `${asDuration(bound.perCoreMs).padStart(width)}  work/cores against a ${asDuration(bound.floorMs)} floor`
        + ` — ${bound.binds}-bound`,
    ...outlierLines(rows, half, width, measured.size === covered.length),
    ...placementLines(rows, marked, half, width, measured.size, covered.length),
    ...markerReachLines(marked, width, root),
    // Costliest, not slowest: the two lines above judge a file by what it cost, and a ranking by test time
    // beside them could omit the very file the outlier line names
    ...costliestFiles(rows, half).map((row) => {
      const reason = marked.get(row.dir)?.get(row.file);
      // The window's oldest reading beside the newest, which is the only thing the history is printed for
      const trend = trendIn(windows.get(row.dir), row.file);
      const moved = trend === undefined ? '' : `  (was ${asDuration(trend.was)} over ${trend.runs} runs)`;
      // The cost, with the test time beside it where overhead is the larger part — otherwise a reader
      // comparing this column to the half's total is comparing two different quantities
      const cost = costOf(row);
      return `${asDuration(cost).padStart(width)}  ${row.dir}/${row.file}`
        + `${cost - row.ms > row.ms ? `, ${asDuration(row.ms)} of it tests` : ''}${moved}`
        + `${reason === undefined ? '' : `  @slow: ${reason}`}`;
    }),
  ];
}

/**
 * Why one project is about to run, given what its stamp was read as and what a diff of its inputs would say.
 *
 * A pool exists to run a subset, so every non-empty run makes a claim about which projects moved — and
 * `npm run chain -- --dry` cannot settle it, because it reports on the *step*, a different unit with a
 * different input set. It can say what moved under `test:unit:host` while being unable to say which of the
 * eleven projects inside it that was.
 *
 * Pure, over a read and a thunk, so the answers can be checked without a stamp on disk — and `??`
 * short-circuits, so the diff is never computed for a stamp that may not be diffed. It takes the *read* rather
 * than the record because that is what makes the two inseparable: the caller cannot reach the fields a diff
 * needs without having been told whether they are readable, where it used to ask one function and then narrow
 * for itself. Forgetting that printed a file name beside a reason that said the stamp could not be read at all.
 */
export const whyItRuns = (read: ReturnType<typeof diffableStamp>, moved: () => string): string =>
  read.undiffable ?? (moved() || 'its inputs changed');
