/**
 * The recorded cost of `@abuddy/cli`'s specs, and the check that each one is in the half its cost implies.
 *
 *     npm run spec-cost:check  -w @abuddy/cli    # reads the record; runs nothing
 *     npm run spec-cost:update -w @abuddy/cli    # re-measures both halves and rewrites it
 *
 * The check runs nothing on purpose. Re-measuring to decide placement would make the cheap half expensive,
 * which is the thing this whole split exists to avoid — so the record is the authority between updates, and
 * the update is the deliberate act. `scripts/lib/spec-cost.ts` holds what both this and
 * `suite-split.spec.ts` read, so a spec and this command cannot disagree about where a file belongs.
 *
 * Run the update with nothing else on the machine. A contended run records a cost that is about the
 * machine, and a spec near the threshold then moves for no reason anyone can see later.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FAST_BELOW_MS, INTEGRATION_ABOVE_MS, PLACEMENT_GUARD, SPEC_COST_FILE, halfOfPath, misplaced, readSpecCost, specFiles, stale, unrecorded,
} from './lib/spec-cost.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PACKAGE_DIR = path.join(REPO_ROOT, 'packages', 'abuddy-cli');
// eslint-disable-next-line no-control-regex -- vitest colours its output and this reads it back
const ANSI = /\u001B\[[0-9;]*m/g;
/** A file's own line in vitest's default reporter: the whole file's time, which is what a half is sized by */
const FILE_LINE = /^\s*[✓×↓❯]\s+(\S+\.spec\.ts)\s+\([^)]*\)\s+([\d.]+)(ms|s)\b/;

function measure(config: string): Record<string, number> {
  const result = spawnSync('npx', ['vitest', 'run', '--config', config], {
    cwd: PACKAGE_DIR, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  // A cost measured from a failing run is not a cost — with one exception, which is the guard that reads
  // the record this command is replacing. While the record is stale it fails, and skipping it instead would
  // leave it with no measured cost at all, so it runs, fails, and is measured like everything else.
  if (result.status !== 0) {
    const failed = [...out.replace(ANSI, '').matchAll(/^\s*FAIL\s+(\S+\.spec\.ts)/gm)].map((m) => m[1]);
    const others = failed.filter((file) => file !== PLACEMENT_GUARD);
    if (others.length > 0 || failed.length === 0) {
      throw new Error(`vitest failed for ${config}; a cost measured from a failing run is not a cost.\n${out.slice(-4000)}`);
    }
  }
  const costs: Record<string, number> = {};
  const skipped: string[] = [];
  for (const raw of out.replace(ANSI, '').split('\n')) {
    const match = FILE_LINE.exec(raw);
    if (!match) continue;
    costs[match[1]] = match[3] === 's' ? Math.round(Number(match[2]) * 1000) : Number(match[2]);
    // A spec that skips costs nothing and would be recorded as the fastest thing in the suite, then be slow
    // the first day it runs — `dependency-runtime` skips until default-setup is built, which is exactly
    // that trap.
    if (/skipped/.test(match[0])) skipped.push(match[1]);
  }
  if (skipped.length > 0) {
    throw new Error(`${config} skipped tests in ${skipped.join(', ')}; a skipped spec records as free and would be filed as fast. Fix the skip, then re-measure.`);
  }
  return costs;
}

function update(): void {
  // What each suite's `pretest` does, because this bypasses it by calling vitest directly. Without it the
  // specs fail on the staleness guard rather than running — and editing this package's package.json to add
  // these very scripts is enough to make its bundle stale.
  const ensured = spawnSync('npm', ['run', 'packages:ensure'], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (ensured.status !== 0) throw new Error(`packages:ensure failed:\n${ensured.stdout}${ensured.stderr}`);

  const costs = { ...measure('vitest.config.ts'), ...measure('vitest.integration.config.ts') };
  const files = specFiles(PACKAGE_DIR);
  const missing = unrecorded(costs, files);
  if (missing.length > 0) throw new Error(`These specs ran nothing, so they have no cost:\n  ${missing.join('\n  ')}`);
  const ordered = Object.fromEntries(Object.entries(costs).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(path.join(REPO_ROOT, SPEC_COST_FILE)), { recursive: true });
  fs.writeFileSync(path.join(REPO_ROOT, SPEC_COST_FILE), `${JSON.stringify({ measuredAt: new Date().toISOString(), costs: ordered }, null, 2)}\n`);

  const moves = misplaced(costs, files);
  console.log(`Recorded ${files.length} specs in ${SPEC_COST_FILE}.`);
  for (const { file, ms, belongs } of moves) console.log(`  ${(ms / 1000).toFixed(1)}s  ${file}  ->  ${belongs}`);
  console.log(moves.length === 0 ? 'Every spec is in the half its cost implies.' : `${moves.length} spec(s) are in the wrong half; rename them.`);
}

function check(): void {
  const record = readSpecCost(REPO_ROOT);
  if (!record) throw new Error(`No ${SPEC_COST_FILE}. Run: npm run spec-cost:update -w @abuddy/cli`);
  const files = specFiles(PACKAGE_DIR);
  const problems = [
    ...unrecorded(record.costs, files).map((f) => `  unmeasured: ${f}`),
    ...stale(record.costs, files).map((f) => `  recorded but gone: ${f}`),
    ...misplaced(record.costs, files).map(({ file, ms, belongs }) => `  ${(ms / 1000).toFixed(1)}s is ${belongs}, but this is in the ${halfOfPath(file)} half: ${file}`),
  ];
  if (problems.length > 0) {
    throw new Error(`Spec costs are out of date (a fast spec moves above ${INTEGRATION_ABOVE_MS}ms, an integration one comes back below ${FAST_BELOW_MS}ms):\n${problems.join('\n')}\n\nRun: npm run spec-cost:update -w @abuddy/cli`);
  }
  const counts = files.reduce((acc, f) => ({ ...acc, [halfOfPath(f)]: (acc[halfOfPath(f)] ?? 0) + 1 }), {} as Record<string, number>);
  console.log(`✅ ${files.length} specs, each in the half its cost implies (${counts.fast ?? 0} fast, ${counts.integration ?? 0} integration)`);
}

if (process.argv.includes('--update')) update();
else check();
