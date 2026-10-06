/**
 * One pool's tests, running only the projects whose inputs changed.
 *
 *     tsx scripts/test-unit-pool.ts host         # the root vitest.config.ts projects, under @abuddy/source
 *     tsx scripts/test-unit-pool.ts pack         # each pack suite, resolving the published dist
 *     tsx scripts/test-unit-pool.ts integration  # the expensive half of every suite that has one
 *
 * What this decides is which projects are stale, how many vitest runs that takes, and when each is stamped.
 * Three things it does not, and does not restate: why the chain has one step per pool (`POOL_STEPS` in
 * `scripts/lib/chain-steps.ts`), what a project's freshness is measured against (`scripts/lib/unit-pool.ts`),
 * and the rule both cache layers hold to (`suiteInputs`, beside the steps).
 *
 * `--all` is read here, from argv, because the chain overriding its own stamps says nothing to a cache it
 * does not know about: the pool steps declare `forceArgs` so the flag arrives.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { diffableStamp, firstChange, freshnessSweep, REPO_ROOT, stampRecord } from '@abuddy/host/build/packages-built';
import type { UnitSuite } from './lib/unit-suites.ts';
import { POOLS, poolStampFor, poolUnitFor, projectsThatDidNotRun, prunePoolStamps, recordRun, recordsVerdict, whyItRuns, type Pool } from './lib/unit-pool.ts';
import type { ReportedRun } from './lib/spec-durations-reporter.ts';
import { boundedSpawn } from './lib/bounded-spawn.ts';
import { POOL_SECONDS } from './lib/chain-steps.ts';
import { MEASURED_ON } from './lib/core-budget.ts';
import { TIMEOUT_MS, timedOutBecause } from './lib/step-timeouts.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';
import { asDuration, durationsOf, halfTotal, markedSpecs, trendOf, placementOf, pruneDurationCache, slowestFiles, tailBar, writeDurations } from './lib/spec-durations.ts';
import { readReportedRun, SPEC_DURATIONS_FILE } from './lib/spec-durations-reporter.ts';
import { HALVES } from './lib/spec-halves.ts';

exitOnEpipe();


/** The diff itself, for the one branch of `whyItRuns` that needs it — over the sweep the decision was made on */
/**
 * Which projects will run, and why — asked of all of them at this one moment, over one reading of the tree.
 *
 * A function rather than a block, so the sweep is unreachable the moment it returns. It caches every byte it
 * reads (14.7MB across the host pool's 2,372 distinct input files), and the run it decides on then spawns vitest
 * for as long as the suites take — `freshnessSweep`'s own rule is that a sweep may not outlive the one question
 * it was made for, and holding one across a test run is the worst way to break it.
 *
 * The verdict goes through the same sweep as the explanation. That is not only the double read it saves: a
 * verdict and an explanation taken from two readings can describe two different trees, which is the shape the
 * chain's report had removed from it a week ago.
 */
function decide(suites: readonly UnitSuite[], pool: Pool, all: boolean): Array<{ suite: UnitSuite; why: string }> {
  const sweep = freshnessSweep();
  return suites.flatMap((suite) => {
    const stamp = poolStampFor(suite, POOLS[pool].half);
    const unit = poolUnitFor(suite, pool);
    const read = diffableStamp(stampRecord(stamp));
    if (!all && sweep.staleReason(unit, stamp) === null) return [];
    // The stamp is read once and handed to both halves, rather than fetched again inside the diff
    const moved = () => (read.stamp === undefined ? '' : firstChange(sweep.changedInputs(unit, read.stamp)));
    return [{ suite, why: all ? '--all' : whyItRuns(read, moved) }];
  });
}

/**
 * What the run that just finished says about its own files: a ranking, and whether every `@slow:` marker
 * in it is still true.
 *
 * Over the output the run already produced, so it adds a parse and no work. The ranking is what vitest
 * does not give — it prints every file's time, in the order the files finished — and the gate is the one
 * question a marker makes checkable.
 *
 * **It throws from inside the stamped thunk.** A gate that reported after the stamps were written would be
 * green on the next run having never re-asked, which is the defect `DIAGNOSTIC_RUN_ENV` exists for.
 */
function reportDurations(kind: Pool, covered: readonly UnitSuite[], reported: ReportedRun): void {
  const rows = durationsOf(reported, covered);
  // A run whose every file was skipped reports no durations, and a ranking of nothing is not a finding.
  // **Not "all cached"**, which this cannot be reached for — `main` returns before building `runs` when
  // nothing is stale. And no longer "the reporter's format moved" either: a reporter that did not run
  // writes no file, which `readReportedRun` answers `undefined` for and the caller refuses on.
  if (rows.length === 0) return;
  // Written whether or not this run may record a verdict. A duration is a measurement, true whoever asked
  // for it — the same reason `recordRun` suppresses a stamp and `ensurePackagesBuilt` does not suppress a
  // build. What reads it is `spec:dry`, which prices a plan and gates nothing.
  writeDurations(REPO_ROOT, rows);

  const marked = new Map(covered.map((suite) => [suite.dir, markedSpecs(path.join(REPO_ROOT, 'packages', suite.dir))]));
  const placement = placementOf(rows, marked);
  // Only the ones `placementOf` found in the tail, not every ranked file without a marker: a run of one
  // small project has a slowest five like any other, and annotating those read as five findings about a
  // suite whose slowest file takes 100ms
  const missing = new Set(placement.unmarked.map((row) => `${row.dir}/${row.file}`));

  for (const half of HALVES) {
    const ranked = slowestFiles(rows, half);
    if (ranked.length === 0) continue;
    const bar = tailBar(rows, half)!;
    const total = halfTotal(rows, half);
    console.log(`${kind} pool: the ${half} half is ${asDuration(total.ms)} of file time over ${total.files} file(s); its slowest (p90 ${asDuration(bar)})`);
    const width = Math.max(...ranked.map((row) => `${row.dir}/${row.file}`.length));
    for (const row of ranked) {
      const named = `${row.dir}/${row.file}`;
      const trend = trendOf(REPO_ROOT, row.dir, half, row.file);
      const moved = trend === undefined ? '' : ` (was ${asDuration(trend.was)} over ${trend.runs} runs)`;
      const note = `${marked.get(row.dir)?.get(row.file) ?? (missing.has(named) ? 'no @slow: marker' : '')}${moved}`.trim();
      console.log(`  ${asDuration(row.ms).padStart(7)}  ${note === '' ? named : `${named.padEnd(width)}  ${note}`}`);
    }
  }
  for (const { half, files } of placement.unplaceable) {
    console.log(`${kind} pool: no marker checked in the ${half} half — ${files} file(s) is too few for a tail, so its p90 is its slowest`);
  }
  if (placement.stale.length > 0) {
    const lines = placement.stale.map(({ dir, file, ms, bar, reason }) =>
      `  ${dir}/${file} ran in ${asDuration(ms)}, inside its half's ${asDuration(bar)} p90 — "${reason}"`);
    throw new Error([
      `${placement.stale.length} spec(s) carry a @slow: marker and are no longer in their half's slow tail:`,
      ...lines,
      'Drop the marker, or replace it with what makes the spec slow now. Load can only inflate a duration,',
      'never shorten one, so a marked spec reading fast is a fact about the spec rather than about the machine.',
    ].join('\n'));
  }
}

/** Where each run's reporter writes, one file per run, removed with the process */
const reports = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-durations-'));

async function main(): Promise<void> {
  // Refused rather than defaulted. With two pools a typo ran the host pool, which at least ran something;
  // with three it would report a pool green having run another one's projects, and the stamps would agree.
  const asked = process.argv[2] ?? '';
  if (!(asked in POOLS)) throw new Error(`no pool named '${asked}' — one of ${Object.keys(POOLS).join(', ')}`);
  const kind = asked as Pool;
  // npm `pretest` hooks do not fire under a root run, so the freshness guard the suites share has nothing
  // to rebuild them. Without this, editing anything a published package is built from — this repo's own
  // package.json included — fails a dozen specs at that guard rather than running them, and the pool
  // quietly collects 162 fewer tests. It is a stat and a return when nothing is stale.
  execFileSync('npm', ['run', 'packages:ensure'], { stdio: 'inherit' });
  prunePoolStamps();
  pruneDurationCache(REPO_ROOT);
  const { half, suites: suitesOf, run } = POOLS[kind];
  const suites = suitesOf();
  const all = process.argv.includes('--all');

  // The sweep lives and dies inside this call, and what comes back is text
  const running = decide(suites, kind, all);
  const stale = running.map(({ suite }) => suite);
  if (stale.length === 0) {
    console.log(`${kind} pool: all ${suites.length} project(s) up to date`);
    return;
  }
  // Why each one runs, not just that it does. A pool exists to run a subset, so every non-empty run makes a
  // claim about which projects moved — and `npm run chain -- --dry` cannot answer it, because it reports on the
  // *step*, a different unit with a different input set. It can say what moved under `test:unit:host` while
  // being unable to say which of the eleven projects inside it that was
  console.log(`${kind} pool: ${stale.length} of ${suites.length} project(s) to run`);
  const width = Math.max(...stale.map((suite) => suite.workspace.length));
  for (const { suite, why } of running) {
    console.log(`  ${suite.workspace.padEnd(width)}  ${why}`);
  }

  // What each run covers is the pool's to say; a suite is stamped only by the run that included it.
  const runs = run(stale);
  // Said out loud, because a run that records nothing looks exactly like one that does until the next run
  // repeats it. `recordsVerdict` has why.
  if (!recordsVerdict()) console.log(`${kind} pool: recording nothing — this is a diagnostic run`);

  for (const { suites: covered, command, args } of runs) {
    // `stampedRunAll`, under `recordRun`, fingerprints every suite this run covers before it starts and writes
    // each stamp only if it returned — so a failure leaves all of them unstamped and none is measured against a
    // tree the run has already begun touching. `recordRun` is what keeps a diagnostic re-run from writing any of
    // them: its verdict is not the chain's to keep, and recording it skipped the step on the next chain.
    await recordRun(
      // The label is what the stamp records as its `workspace`, and it names the half for the same reason the
      // filename does: a person opening the cache directory has to be able to tell two records apart. Nothing
      // reads it — `unitStaleReason` consults the fingerprint and nothing else — so this is a diagnostic, and
      // what keeps the two records *distinct* is the command inside that fingerprint.
      covered.map((suite) => ({ label: `${suite.dir} (${half})`, unit: poolUnitFor(suite, kind), stamp: poolStampFor(suite, half) })),
      async () => {
        // `suite`, the same class the chain gives this pool as a step — a pool fans out across workers, so
        // it is the rung that stretches most on a smaller box. The *deadline* is never `POOL_SECONDS`, which
        // is this machine's measurement and so would be this machine's deadline (`step-timeouts.ts`); the
        // message below reads that cost, which is a different use of it and the one it is for.
        const reportFile = path.join(reports, `${covered.map((suite) => suite.dir).join('+')}.json`);
        const { code, output, timedOut } = await boundedSpawn(command, [...args], TIMEOUT_MS.suite.ms,
          { env: { ...process.env, [SPEC_DURATIONS_FILE]: reportFile } });
        process.stdout.write(output);
        if (code !== 0) {
          // `POOL_SECONDS` only where this run is the whole pool, which is the one thing that cost describes
          // — a run of two projects out of eleven has no recorded cost, and the message says that rather than
          // computing a rope from a number about other work
          throw new Error(timedOut
            ? timedOutBecause({
              what: `${kind} pool`,
              timeout: 'suite',
              measuredOn: MEASURED_ON,
              ...covered.length === suites.length ? { seconds: POOL_SECONDS[kind] } : {},
            })
            : `${kind} pool failed (exit ${code})`);
        }
        // Only what the run reported may be stamped: a `--project` filter matching nothing is dropped
        // silently while the others run, so exiting 0 is not evidence that every project was covered.
        // The reporter's own account of the run, which is what every verdict below reads. A missing file
        // is refused rather than read as an empty run: a reporter that stopped being called would
        // otherwise leave the project check with nothing to find absent and the marker gate with nothing
        // to check, both reporting success.
        const reported = readReportedRun(reportFile);
        if (reported === undefined) {
          throw new Error(`${kind} pool ran and its durations reporter wrote nothing to ${reportFile} — the reporter did not run, so nothing in this run was measured, no @slow: marker was checked and no project was confirmed to have reported. scripts/lib/spec-durations-reporter.ts pins its hooks against vitest's own interface, so a typecheck will name the cause`);
        }
        const absent = projectsThatDidNotRun(covered.map((suite) => suite.workspace), reported);
        if (absent.length > 0) {
          throw new Error(`${kind} pool asked vitest for ${covered.length} projects and ${absent.join(', ')} never reported — a --project filter matched nothing, so their names and vitest's project names have diverged`);
        }
        reportDurations(kind, covered, reported);
      },
    );
  }
}

// A throw here would otherwise surface as an unhandled rejection, printing a stack on top of the suite
// output that is the thing worth reading. `process.exitCode` rather than `process.exit()`, which would
// truncate that output — the rule `orchestrator-exit.spec.ts` holds for every script here that reprints a
// captured buffer.
try {
  await main();
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
