// `npm run spec` — run the specs that could fail because of what you changed.
//
// Running one spec is the cheapest check this repo has (1-3s against a chain run), and what made it awkward
// was never vitest: it was deciding what to run and then addressing it. A path from a stack trace is
// repo-relative while the command wants a workspace plus a package-relative path; and after editing a source
// file the honest answer to "what covers this?" took a grep, so the reflex was to run the whole package
// suite instead — 543 tests where 25 would do.
//
// So you do not tell it what kind of thing you are giving it:
//
//   npm run spec                            the specs your uncommitted changes affect
//   npm run spec -- <spec path>             that spec
//   npm run spec -- <name>                  every spec whose path contains it — how you run one while working
//   npm run spec -- <directory>             every spec under it
//   npm run spec -- <source file>           every spec that imports it, transitively, in whatever package
//   npm run spec -- <any of the above> -t "case"     anything starting with `-` goes to vitest untouched
//   npm run spec -- --changed HEAD~1        a different base for the change set
//   npm run spec:full [...]                 and the pack suites a rebuilt `dist` would reach
//
// A **source file** is the case worth knowing about. It used to run the file's own package, which for
// `@abuddy/sdk` was one of the seven suites that cover it: a green run of specs that could not fail for the
// change. It now runs one vitest over every host project, which is what the root `vitest.config.ts` is for.
// That costs what the blast radius costs — a component nothing imports is still 1-3s, a type every pack's
// data flows through is 28s and 104 files. To go back to one spec while iterating, name it.
//
// Where it can, it delegates to the package's own `test` script, so @abuddy/cli's and @app/default-setup's
// pretest guard (`packages:ensure`) and each vitest config still apply. A root run has no such hook, so the
// plan puts `packages:ensure` in front of it.
//
// **Two more edges run through a build, inside a pack.** `src/seeds/**` compiles to `dist/*.seed.json`, which
// `tests/seeds/` reads against its goldens, and `abuddy.json` drives codegen into `src/__generated__/`, which
// every spec in the pack imports. The walk still runs — a seed helper the specs import directly is answered by
// it — and carries what it could not see (`Run.beyond`); `npm run spec:full` builds the pack and runs them.
//
// What a module graph cannot reach is a **pack suite**: it resolves the published `dist` while the host
// projects resolve source, so its specs never import `packages/<dep>/src` and no import edge runs from the
// file you edited to the spec that covers it. `npm run spec` says so when it is true — derived from the
// declared dependencies, so editing a package no pack depends on says nothing — and `npm run spec:full`
// answers it, at the cost of a build (14s when stale) and the pack suite (18s).
//
// **Three exit codes, because the three need different next moves and only one is a bug in the code:**
//
//   1  a spec failed — the ordinary one
//   2  a name was wide enough to be a search, so the paths were listed instead of run
// `npm run spec:dry` answers "what would this run, and what does the record say it costs" without running any
// of it. It collects — ~1.6s whatever comes back — which the ordinary run never does: the collector and the
// pricing load behind `await import`, and repo-checks asserts that from this file's source.
//
// `--no-bail` runs the whole plan after a failure, which is what this did before: a 1s failure used to pay for
// the pack suite behind it.
//
//   3  nothing ran and nothing passed: no spec covers the target, or the specs that do sit behind a build
//      this run is not doing (a pack's seed sources, its `abuddy.json`) — `npm run spec:full` answers those
//
// 3 is the one worth knowing about. `vitest related` exits 0 when the module graph reaches no spec, so until it
// existed "nothing covers this" and "everything covering this passed" were the same output and the same code —
// and five of eight sampled entry modules answered zero. A run only earns that judgement if its route promised
// coverage of a file a spec could cover (`Run.claimsCoverageOf`): a whole-suite run, a `-t` filter that matched
// no case, and a `.md` target all report zero correctly.
//
// `scripts/lib/spec-plan.ts` decides all of that and is asserted by a spec; this file runs what it returns.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SPEC_COUNT_FILE } from './lib/spec-count-reporter.ts';
import { ENSURE_LABEL, exitCodeFor, packageOf, planChanged, planTargets, type Run, splitArgs, verdictOf } from './lib/spec-plan.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

const { full, bail, dry, targets, flags } = splitArgs(process.argv.slice(2));

/** What git reports as changed, repo-relative. `planChanged` derives the packages and reads the paths itself */
function changed(): string[] {
  const out = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf-8' }).stdout ?? '';
  return out.split('\n').filter(Boolean).map((l) => l.slice(3).trim().split(' -> ').pop()!);
}

const changedPaths = targets.length > 0 ? [] : changed();

if (targets.length === 0 && changedPaths.length === 0) {
  console.log('Nothing changed, and no spec named — nothing to run.');
  process.exit(0);
}

const { runs, unmatched, ambiguous } = targets.length > 0
  ? planTargets(targets, flags, ROOT, { full })
  : planChanged(changedPaths, flags, ROOT, { full });

// A change set with nothing a spec could cover: the plan is no runs, and saying so is the whole answer
if (runs.length === 0 && targets.length === 0) {
  console.log('Nothing changed that a spec could cover — no spec run.');
  process.exit(0);
}

if (unmatched.length > 0) {
  console.error(`No spec or file matches ${unmatched.map((t) => `"${t}"`).join(', ')}`);
  process.exit(1);
}

// A name wide enough to be a search is answered with the paths, not by running them: the one to run is a copy away,
// and running two dozen across eight suites because a word was short is not the narrowest thing that could fail.
if (ambiguous.length > 0) {
  for (const { query, specs } of ambiguous) {
    console.error(`"${query}" matches ${specs.length} specs across ${new Set(specs.map((f) => packageOf(path.relative(ROOT, f)))).size} suites:\n`);
    for (const f of specs) console.error(`  ${path.relative(ROOT, f)}`);
    console.error(`\nRun one, or several:\n  npm run spec -- ${path.relative(ROOT, specs[0])}`);
  }
  process.exit(2);
}

const reports = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-count-'));
const COUNT_REPORTER = path.join(import.meta.dirname, 'lib', 'spec-count-reporter.ts');

/**
 * How many spec files a run executed, which its exit status cannot say: `vitest related` exits 0 for a file
 * nothing covers. `spec-count-reporter.ts` records it and prints nothing; see its header for why vitest's own
 * `json` reporter is not used.
 *
 * `--reporter=default` goes alongside because naming any reporter *replaces* the human output. Skipped when the
 * caller already chose one, so `--reporter=verbose` does not become three reporters.
 */
function counted(run: Run, index: number): { args: string[]; env: NodeJS.ProcessEnv; read: () => number | undefined } {
  const file = path.join(reports, `${index}`);
  const chose = [...run.args].some((a) => a.startsWith('--reporter'));
  return {
    args: [...run.args, ...(chose ? [] : ['--reporter=default']), `--reporter=${COUNT_REPORTER}`],
    env: { ...process.env, [SPEC_COUNT_FILE]: file },
    // `undefined` for a file that never arrived, which is not the same as zero and must not read as a pass:
    // a reporter that stopped being called is how this whole check would go quiet
    read: () => (fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf-8')) : undefined),
  };
}

/**
 * What the plan would run and what the record says it costs, collecting rather than running.
 *
 * Collection is flat in the size of the answer — 1.6s for 0 specs and 1.6s for 150, measured, because it is
 * the eleven project configs being loaded rather than a graph being walked. Worth it against a 20s root run
 * and not against a 3s one, which is why it is its own command rather than something the ordinary run pays.
 */
if (dry) {
  const { priceSpecs, priceSuites, tierOfRun, asSeconds } = await import('./lib/spec-dry.ts');
  const { createVitest } = await import('vitest/node');
  let total = 0;
  const unpriced: string[] = [];
  const dates: string[] = [];

  for (const run of runs) {
    const tier = tierOfRun(run, ROOT);
    console.log(`\n→ ${run.label}${tier === undefined ? '' : `  [tier ${tier}]`}`);
    // Three ways a run's file list is known, and a run that is none of them says so: collected from the
    // graph, named by the target, or a suite's whole record. Without the last two a plan's most expensive
    // runs — a named spec, `--full`'s pack suite — would contribute nothing and read as free
    let priced;
    if (run.collects !== undefined) {
      const vitest = await createVitest('test', {
        watch: false, silent: true,
        ...(run.collects.related === undefined ? {} : { related: [...run.collects.related] }),
        ...(run.collects.changed === true ? { changed: true } : {}),
      });
      priced = priceSpecs([...new Set((await vitest.getRelevantTestSpecifications()).map((spec) => spec.moduleId))]
        .map((id) => path.relative(ROOT, id)).sort(), ROOT);
      await vitest.close();
    } else if (run.specs !== undefined) {
      priced = priceSpecs([...run.specs].sort(), ROOT);
    } else if (run.covers !== undefined) {
      priced = priceSuites(run.covers, ROOT);
    } else {
      console.log('   no specs of its own: it builds, or makes the packages current');
      continue;
    }
    const specs = priced.specs;
    total += priced.fileTimeMs;
    unpriced.push(...priced.unpriced);
    if (priced.measuredAt !== undefined) dates.push(priced.measuredAt);
    for (const spec of specs) console.log(`   ${spec}`);
    console.log(`   ${specs.length} spec${specs.length === 1 ? '' : 's'}, ${asSeconds(priced.fileTimeMs)} of recorded file-time`);
  }

  // File-time, and said to be: it is summed across workers, and the ratio to wall was 1.55:1 and 2.18:1 on
  // one target three days apart, so any wall number derived from it would be wrong by a third within a week
  console.log(`\n${asSeconds(total)} of recorded file-time, summed across workers — not time to wait.`);
  // The record is a sample kept with hysteresis, so this is a band and its age is the record's own field
  if (dates.length > 0) console.log(`Read from records last measured ${dates.sort()[0]!.slice(0, 10)}; a row may sit up to 15% from the truth by design.`);
  for (const spec of unpriced) console.error(`  no recorded cost: ${spec}`);
  if (unpriced.length > 0) console.error(`  ${unpriced.length} unpriced, so the total is short — npm run spec-cost:update`);
  process.exit(0);
}

let failed = 0;
/** The runs a bail did not reach, named rather than silently skipped */
let notReached: readonly Run[] = [];
const uncovered: Run[] = [];
const noCount: string[] = [];
// Each distinct note once: two source-file targets are two root runs carrying the same sentence about the
// pack suites, and a limit worth stating is not worth stating twice
const said = new Set<string>();
try {
  for (const [index, run] of runs.entries()) {
    if (run.label !== ENSURE_LABEL) console.log(`\n→ ${run.label}`);
    const counter = run.claimsCoverageOf === undefined ? undefined : counted(run, index);
    const result = spawnSync(run.command, counter?.args ?? [...run.args],
      { cwd: run.cwd, stdio: 'inherit', env: counter?.env });
    const verdict = verdictOf(run, result.status ?? 1, counter?.read());
    if (verdict === 'fail') {
      failed++;
      // The failure is the answer, and every run behind it is a bill for information already in hand: a 1s
      // tier-1 failure used to pay for the 18s pack suite that followed it
      if (bail) { notReached = runs.slice(index + 1); break; }
    }
    if (verdict === 'uncovered') uncovered.push(run);
    if (verdict === 'no count') noCount.push(run.label);
    if (run.note !== undefined && !said.has(run.note)) { console.log(`   ${run.note}`); said.add(run.note); }
    // Said only when the run answered something: when it did not, the edge is the whole answer and is
    // reported below instead, where it replaces a sentence that would be false
    if (run.beyond !== undefined && verdict === 'pass') {
      console.log(`   not in this answer: ${run.beyond.covers} — ${run.beyond.how}`);
    }
  }
} finally {
  fs.rmSync(reports, { recursive: true, force: true });
}

// Both are said, even though only one can be the exit code: a hole found beside a failure is information
// already in hand, and dropping it means finding it on the next run instead
if (notReached.length > 0) {
  console.error(`\nStopped at the first failure, so ${notReached.length} run${notReached.length === 1 ? ' was' : 's were'} not reached:`);
  for (const run of notReached) console.error(`  ${run.label}`);
  console.error('  npm run spec -- --no-bail … runs them anyway.');
}

// Two sentences for one emptiness, because they are opposite facts: a gap in the suite, and specs that
// exist behind a build this run did not do. Saying the first for the second is what a seed source used to get
for (const run of uncovered) {
  const target = run.claimsCoverageOf!;
  console.error(run.beyond === undefined
    ? `\nNo spec covers ${target} — nothing ran, so nothing passed.`
    : `\nNothing ran for ${target}. It is covered by ${run.beyond.covers} — an edge that runs through a `
      + `build, so no module graph connects the two.\n  ${run.beyond.how}`);
}
// Loud rather than assumed, because assuming it ran something is how the check would stop checking
for (const label of noCount) {
  console.error(`\n${label}: the spec count never arrived, so whether anything ran is unknown.`
    + `\n  ${path.relative(ROOT, COUNT_REPORTER)} did not write it — is it still a reporter vitest calls?`);
}
process.exit(exitCodeFor({ failed, uncovered: uncovered.length, noCount: noCount.length }));
