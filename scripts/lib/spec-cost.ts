/**
 * What a spec costs, and which half it therefore belongs in.
 *
 * `@abuddy/cli` runs two suites: a fast one that is the per-change loop, and an integration one for the
 * specs that are expensive. The rule was *"a spec that runs a build, an install or another process is an
 * integration spec"* — spawning as a proxy for cost, which held only while spawning was the only way to be
 * slow. Three counter-examples ended that: a helper that reaches esbuild (which spawns) while reading as
 * clean, a 48s spec with no spawn sites at all, and a 20ms spec classified as spawning because the export
 * it imports defaults to `spawnSync`.
 *
 * So the predicate is the cost itself, recorded rather than inferred. `scripts/spec-cost.ts` measures it;
 * this module is the part a spec and that command share, so the check and the record cannot disagree.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Where a suite's record lives, relative to the repo root. One per package rather than one for the repo:
 * a package's specs are measured by running that package's configs, so the file that records them belongs
 * beside the thing that produced it, next to the other recorded artifacts in `etc/`.
 */
export const specCostFile = (dir: string): string => path.join('packages', dir, 'etc', 'spec-cost.json');

/**
 * The band a spec must leave before it changes half.
 *
 * **A single threshold oscillates, measured.** A file's recorded time is its wall time under whatever else
 * that half is running, so moving a spec changes its cost: `dependency-flow-helpers` read 4.7s in the fast
 * half and 2.4s in the integration half, and a lone threshold between those two numbers would send it back
 * and forth on every update. Four specs did exactly that on the first pass.
 *
 * So there are two edges and a dead band between them. A fast spec moves only when it exceeds
 * `INTEGRATION_ABOVE_MS`; an integration spec comes back only when it drops under `FAST_BELOW_MS`. Anything
 * between stays where it is, which is the answer to noise and to the contention difference alike.
 *
 * The numbers: 2.5s is the widest gap in the measured distribution (2118 -> 2930, 812ms, about four times
 * the next best), and 1.5s is below every spec that has been seen to sit in the band from the integration
 * side. What it buys is a fast half of roughly 17s of file time — a couple of seconds of wall across
 * workers, so the per-change loop is still a loop.
 */
export const INTEGRATION_ABOVE_MS = 2_500;
export const FAST_BELOW_MS = 1_500;

export interface SpecCost {
  /** Measured milliseconds, per spec path relative to the package */
  readonly costs: Record<string, number>;
  /**
   * Specs that ran nothing because every test in them was skipped, so they have no cost to record.
   *
   * This is a third state, and collapsing it into either of the others is a trap. Treating such a file as
   * costing nothing would file it as the cheapest spec in the suite and place it accordingly, until the day
   * its precondition is met and it runs — `features/code/be/claude-code-permission-flow` needs a real `claude`
   * binary. Treating it as unmeasured would fail the check forever for a file that is behaving correctly.
   * Recorded here it is neither, and `spec-cost:check` notices when one starts reporting a duration.
   */
  readonly skipped: string[];
  readonly measuredAt: string;
}

export const INTEGRATION_SUFFIX = '.integration.spec.ts';

/**
 * Set by `spec-cost:update` on the run it measures. The guard that reads the record is itself a spec in the
 * suites being measured, so while the record is being rewritten it would fail on the record it is about to
 * replace, and the update could never succeed. `seed-parity` has the same shape and solves it the same way
 * with `UPDATE_SEED_GOLDEN`.
 */
export const UPDATING_ENV = 'UPDATE_SPEC_COST';

/** The guard that reads this record. It is the one spec that skips itself while the record is rewritten. */
export const PLACEMENT_GUARD = 'tests/suite-split.spec.ts';
export const isUpdating = (env: NodeJS.ProcessEnv = process.env): boolean => env[UPDATING_ENV] === '1';
export type Half = 'fast' | 'integration';
export const halfOfPath = (file: string): Half => (file.endsWith(INTEGRATION_SUFFIX) ? 'integration' : 'fast');

/** Where a spec belongs, given where it is now: it stays put inside the dead band */
export function halfFor(file: string, ms: number): Half {
  const now = halfOfPath(file);
  if (now === 'fast' && ms > INTEGRATION_ABOVE_MS) return 'integration';
  if (now === 'integration' && ms < FAST_BELOW_MS) return 'fast';
  return now;
}

export function readSpecCost(repoRoot: string, dir: string): SpecCost | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, specCostFile(dir)), 'utf-8')) as SpecCost;
  } catch {
    return undefined;
  }
}

/**
 * The vitest configs a package runs its specs under. `@abuddy/cli` has two, a fast half and an integration
 * half; every other suite has one. A spec's cost is measured under the config that actually runs it, which
 * is why this is read from the package rather than assumed.
 */
export function configsFor(packageDir: string): string[] {
  return ['vitest.config.ts', 'vitest.integration.config.ts'].filter((file) => fs.existsSync(path.join(packageDir, file)));
}

/** A package with one config has no second half to move a spec into — Decision 4 makes that a finding */
export const hasSplit = (packageDir: string): boolean => configsFor(packageDir).length > 1;

/**
 * Every spec a package owns, relative to the package.
 *
 * Both `tests/` and `src/`, and `src/` is now a net rather than a necessity. It was there because
 * `@app/default-setup` ran six colocated specs and walking only `tests/` reported them as
 * recorded-but-gone; those moved under `tests/` and no package colocates any more. Keeping the walk is
 * what stops the next one being silent twice over: no config includes `src/**` now, so such a spec would
 * never run, and if this did not see it the record would not report it missing either. As it is, it lands
 * here with no measured cost and `suite-split.spec.ts` says so by name.
 *
 * Ignoring what a package builds keeps the walk to sources: `dist` holds compiled copies, and `etc` is
 * where the record itself lives.
 */
const IGNORED = new Set(['node_modules', 'dist', 'etc', 'coverage']);
export function specFiles(packageDir: string): string[] {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith('.') || IGNORED.has(entry.name)) return [];
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(spec|test)\.ts$/.test(entry.name) ? [path.relative(packageDir, full)] : [];
    });
  return walk(packageDir).sort();
}

export interface Misplaced { readonly file: string; readonly ms: number; readonly belongs: Half }

/** Specs whose filename puts them in one half while their recorded cost puts them in the other */
export function misplaced(costs: Record<string, number>, files: readonly string[]): Misplaced[] {
  return files.flatMap((file) => {
    const ms = costs[file];
    if (ms === undefined) return [];
    const belongs = halfFor(file, ms);
    return belongs === halfOfPath(file) ? [] : [{ file, ms, belongs }];
  });
}

/** Specs with no recorded cost and no recorded reason: a new one is unmeasured until `spec-cost:update` runs */
export const unrecorded = (record: SpecCost, files: readonly string[]): string[] =>
  files.filter((file) => record.costs[file] === undefined && !record.skipped.includes(file));

/**
 * Specs costing more than a fast half allows, in a package that has no slower half.
 *
 * Decision 4: a finding, not an exception and not a reason to raise a budget. What the finding is *for* is
 * knowing — a cost nobody has looked at is the failure this whole record exists against. It is not a
 * request to split the package: a split buys a different tier, and slowness alone does not need one.
 * `suite-split.spec.ts` carries the criterion and the measurement behind it.
 */
export const outgrown = (costs: Record<string, number>, files: readonly string[]): Misplaced[] =>
  files.flatMap((file) => {
    const ms = costs[file];
    return ms !== undefined && ms > INTEGRATION_ABOVE_MS ? [{ file, ms, belongs: 'integration' as Half }] : [];
  });

/** A spec recorded as skipped that has since started running, so its cost is now measurable */
export const nowRunning = (record: SpecCost, measured: Record<string, number>): string[] =>
  record.skipped.filter((file) => measured[file] !== undefined);

/** Recorded specs that no longer exist */
export const stale = (record: SpecCost, files: readonly string[]): string[] =>
  [...Object.keys(record.costs), ...record.skipped].filter((file) => !files.includes(file)).sort();
