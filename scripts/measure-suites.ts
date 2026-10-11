/**
 * Each unit suite run alone: its work (the sum of its files' times), its floor (its slowest single file)
 * and its file count.
 *
 *     npx tsx scripts/measure-suites.ts
 *
 * Alone and serially on purpose. Both numbers are about one suite's own shape, and a suite measured beside
 * another is measuring the machine — contention has produced a wrong answer here more than once. The floor
 * is what bounds a run however the work is scheduled, so `max(floor, work/cores)` is the target any change
 * to scheduling is measured against. **That figure is computed now** — `halfBound` in
 * `lib/spec-durations.ts`, printed under every pool step — and the thing to know before reading either is
 * what `work` has to include: tests and hooks are about half of it. Measured 2026-10-06, the host pool is
 * 141.4s of tests against 139.6s of import and setup, and the pack pool 19.9s against 163.8s. A
 * `work/cores` taken from test time alone put an 18.3s floor over an 8.7s work figure and a 96-case file
 * was split on it for no wall-clock gain; the honest figure was 28.1s, against a measured 29.0s wall. **That is why this still exists beside the pools' duration cache**,
 * which holds only in-pool numbers: every figure in there was measured under contention by design.
 *
 * It reads the run's own reporter (`lib/spec-durations-reporter.ts`), as the pools do. It parsed the console
 * until 2026-10-06, and what that cost is the reason to say so: with no line matching — a reporter format
 * away — it printed a complete-looking table of zeros and `total work 0.0s`, which for a tool whose whole
 * output is a number someone quotes is worse than failing. A suite the reporter wrote nothing for is now
 * named and left out of the totals, and the exit code says it happened.
 *
 * `scripts/lib/slow-tests.ts` keeps its parser, and that is not unfinished work: it reads *any* chain step's
 * output for per-test times, including `test:external-pack:contract` and `test:packaged-authoring`, which run
 * vitest without this reporter. Porting it would mean threading the reporter through every step that runs
 * vitest, or losing those two silently.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { REPO_ROOT } from '@apack/host/build/packages-built';
import { durationsOf, halfTotal, slowestFiles } from './lib/spec-durations.ts';
import { readReportedRun, SPEC_DURATIONS_FILE } from './lib/spec-durations-reporter.ts';
import { UNIT_SUITES } from './lib/unit-suites.ts';

/** `npm test -w <workspace>` runs a suite's fast half, which is the half this has always measured */
const HALF = 'fast';
const REPORTER = path.join(REPO_ROOT, 'scripts', 'lib', 'spec-durations-reporter.ts');
const reports = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-suites-'));

interface Row { suite: string; work: number; floor: number; floorFile: string; files: number }

const rows: Row[] = [];
/** The suites the reporter wrote nothing for — a named bucket beside the total, never folded into it */
const unmeasured: string[] = [];

for (const suite of UNIT_SUITES) {
  const file = path.join(reports, `${suite.dir}.json`);
  const started = Date.now();
  try {
    // `--` so npm forwards the reporter flags to vitest; `--reporter=default` because naming any reporter
    // replaces the human output, and this prints a suite's progress to stderr as it goes
    execFileSync('npm', ['test', '-w', suite.workspace, '--', '--reporter=default', `--reporter=${REPORTER}`], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, [SPEC_DURATIONS_FILE]: file },
    });
  } catch {
    // A failing suite still reports what its files took: `onTestRunEnd` runs whatever the run's verdict was,
    // and the numbers are the subject here rather than the pass
  }
  const wall = Date.now() - started;
  const run = readReportedRun(file);
  if (run === undefined) {
    unmeasured.push(suite.workspace);
    console.error(`  ${suite.workspace} reported nothing (${(wall / 1000).toFixed(1)}s wall)`);
    continue;
  }
  const measured = durationsOf(run, [suite]);
  const total = halfTotal(measured, HALF);
  const [slowest] = slowestFiles(measured, HALF, 1);
  rows.push({
    suite: suite.workspace,
    work: total.ms,
    floor: slowest?.ms ?? 0,
    floorFile: slowest?.file ?? '-',
    files: total.files,
  });
  console.error(`  ${suite.workspace} done (${(wall / 1000).toFixed(1)}s wall)`);
}

rows.sort((a, b) => b.work - a.work);
const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
console.log('\n| suite | work | floor | files | floor file |');
console.log('|---|---|---|---|---|');
for (const r of rows) console.log(`| \`${r.suite}\` | ${s(r.work)} | **${s(r.floor)}** | ${r.files} | ${r.floorFile} |`);

if (rows.length === 0) {
  console.log('\nnothing measured — no suite reported durations');
} else {
  console.log(`\ntotal work ${s(rows.reduce((t, r) => t + r.work, 0))}, max floor ${s(Math.max(...rows.map((r) => r.floor)))}`
    + ` over ${rows.length} of ${UNIT_SUITES.length} suites`);
}
// Said on the line and in the status, because a partial table read as a whole one is the failure this
// replaces: the figures above are quoted into commit messages and goal docs
if (unmeasured.length > 0) {
  console.log(`\n${unmeasured.length} suite(s) reported no durations: ${unmeasured.join(', ')}`);
  process.exitCode = 1;
}
