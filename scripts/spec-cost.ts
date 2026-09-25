/**
 * What every unit suite's specs cost, and the check that each one is where its cost puts it.
 *
 *     npm run spec-cost:check     # reads the records; runs nothing
 *     npm run spec-cost:update    # re-measures every suite and rewrites them
 *     npm run spec-cost:update -- --suite abuddy-cli    # one suite, when only it changed
 *
 * The check runs nothing on purpose. Re-measuring to decide placement would make the cheap half expensive,
 * which is the thing the split exists to avoid — so the record is the authority between updates, and the
 * update is the deliberate act. `scripts/lib/spec-cost.ts` holds what this and `suite-split.spec.ts` share,
 * so a spec and this command cannot disagree about where a file belongs.
 *
 * Run the update with nothing else on the machine. A contended run records a cost that is about the
 * machine, and a spec near an edge then moves for no reason anyone can see later.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { UNIT_SUITES, type UnitSuite } from './lib/unit-suites.ts';
import {
  FAST_BELOW_MS, INTEGRATION_ABOVE_MS, PLACEMENT_GUARD, configsFor, halfOfPath, hasSplit, misplaced,
  readSpecCost, specCostFile, specFiles, stale, unrecorded,
} from './lib/spec-cost.ts';

// eslint-disable-next-line no-control-regex -- vitest colours its output and this reads it back
const ANSI = /\u001B\[[0-9;]*m/g;
/**
 * A file's own line in vitest's default reporter: the whole file's time, which is what a half is sized by.
 * The optional `|project|` is what a pooled run prefixes; a per-package run has none, and this reads both.
 */
const FILE_LINE = /^\s*[✓×↓❯]\s+(?:\|[^|]*\|\s+)?(\S+\.(?:spec|test)\.ts)\s+\(([^)]*)\)(?:\s+([\d.]+)(ms|s)\b)?/;

const packageDir = (suite: UnitSuite): string => path.join(REPO_ROOT, 'packages', suite.dir);

interface Measured { costs: Record<string, number>; skipped: string[] }

function measure(suite: UnitSuite, config: string): Measured {
  const dir = packageDir(suite);
  const result = spawnSync('npx', ['vitest', 'run', '--config', config], { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(ANSI, '');

  // A cost measured from a failing run is not a cost — with one exception, the guard that reads the record
  // this command is replacing. While the record is stale it fails, and skipping it instead would leave it
  // with no measured cost at all, so it runs, fails, and is measured like everything else.
  if (result.status !== 0) {
    const failed = [...out.matchAll(/^\s*FAIL\s+(?:\|[^|]*\|\s+)?(\S+\.(?:spec|test)\.ts)/gm)].map((m) => m[1]);
    const others = failed.filter((file) => file !== PLACEMENT_GUARD);
    if (others.length > 0 || failed.length === 0) {
      throw new Error(`vitest failed for ${suite.workspace} ${config}; a cost measured from a failing run is not a cost.\n${out.slice(-4000)}`);
    }
  }

  const costs: Record<string, number> = {};
  const skipped: string[] = [];
  const partial: string[] = [];
  for (const raw of out.split('\n')) {
    const match = FILE_LINE.exec(raw);
    if (!match) continue;
    const [, file, counts, value, unit] = match;
    if (value === undefined) {
      // No duration at all: vitest prints none for a file where every test was skipped
      skipped.push(file);
      continue;
    }
    costs[file] = unit === 's' ? Math.round(Number(value) * 1000) : Number(value);
    // A file that ran some of its tests and skipped the rest has a cost that understates it, which is worse
    // than having none — it would be placed on a number that is not what the file does.
    if (/skipped/.test(counts)) partial.push(file);
  }
  if (partial.length > 0) {
    throw new Error(`${suite.workspace} ${config} skipped some tests in ${partial.join(', ')}; that file's cost understates it. Fix the skip, then re-measure.`);
  }
  return { costs, skipped };
}

function update(only: string | undefined): void {
  // What each suite's `pretest` does, because this bypasses it by calling vitest directly. Without it the
  // specs fail on the staleness guard rather than running.
  const ensured = spawnSync('npm', ['run', 'packages:ensure'], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (ensured.status !== 0) throw new Error(`packages:ensure failed:\n${ensured.stdout}${ensured.stderr}`);

  for (const suite of UNIT_SUITES.filter((candidate) => !only || candidate.dir === only)) {
    const dir = packageDir(suite);
    const runs = configsFor(dir).map((config) => measure(suite, config));
    const costs = Object.assign({}, ...runs.map((run) => run.costs)) as Record<string, number>;
    const skipped = [...new Set(runs.flatMap((run) => run.skipped))].filter((file) => costs[file] === undefined).sort();
    const files = specFiles(dir);
    const record = { measuredAt: new Date().toISOString(), costs: Object.fromEntries(Object.entries(costs).sort(([a], [b]) => a.localeCompare(b))), skipped };

    const missing = unrecorded(record, files);
    if (missing.length > 0) throw new Error(`These ${suite.workspace} specs ran nothing and were not reported as skipped:\n  ${missing.join('\n  ')}`);

    const file = path.join(REPO_ROOT, specCostFile(suite.dir));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);

    const moves = misplaced(costs, files);
    console.log(`${suite.workspace.padEnd(20)} ${String(files.length).padStart(3)} specs${skipped.length ? `, ${skipped.length} skipped` : ''} -> ${specCostFile(suite.dir)}${moves.length ? `  (${moves.length} in the wrong half)` : ''}`);
    for (const { file: spec, ms, belongs } of moves) console.log(`  ${(ms / 1000).toFixed(1)}s  ${spec}  ->  ${belongs}`);
  }
}

function check(): void {
  const problems: string[] = [];
  const staleSuites = new Set<string>();
  let total = 0;
  for (const suite of UNIT_SUITES) {
    const dir = packageDir(suite);
    const record = readSpecCost(REPO_ROOT, suite.dir);
    if (!record) {
      problems.push(`  no ${specCostFile(suite.dir)}`);
      staleSuites.add(suite.dir);
      continue;
    }
    const files = specFiles(dir);
    total += files.length;
    const before = problems.length;
    problems.push(
      ...unrecorded(record, files).map((f) => `  unmeasured: ${suite.dir}/${f}`),
      ...stale(record, files).map((f) => `  recorded but gone: ${suite.dir}/${f}`),
      ...(hasSplit(dir)
        ? misplaced(record.costs, files).map(({ file, ms, belongs }) => `  ${(ms / 1000).toFixed(1)}s is ${belongs}, but this is in the ${halfOfPath(file)} half: ${suite.dir}/${file}`)
        : []),
    );
    if (problems.length > before) staleSuites.add(suite.dir);
  }
  if (problems.length > 0) {
    // Naming the suites matters: re-measuring all eight is a minute, and one is seconds. A check whose
    // advice costs more than the fix is a check people work around.
    const fix = staleSuites.size === UNIT_SUITES.length
      ? 'npm run spec-cost:update'
      : [...staleSuites].map((dir) => `npm run spec-cost:update -- --suite ${dir}`).join('\n     ');
    throw new Error(`Spec costs are out of date (a fast spec moves above ${INTEGRATION_ABOVE_MS}ms, an integration one comes back below ${FAST_BELOW_MS}ms):\n${problems.join('\n')}\n\nRun: ${fix}`);
  }
  console.log(`✅ ${total} specs across ${UNIT_SUITES.length} suites, each recorded and in the half its cost implies`);
}

const suiteFlag = process.argv.indexOf('--suite');
if (process.argv.includes('--update')) update(suiteFlag === -1 ? undefined : process.argv[suiteFlag + 1]);
else check();
