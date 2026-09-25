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

/** Where the record lives, relative to the repo root */
export const SPEC_COST_FILE = path.join('packages', 'abuddy-cli', 'etc', 'spec-cost.json');

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
export const PLACEMENT_GUARD = 'tests/build/suite-split.spec.ts';
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

export function readSpecCost(repoRoot: string): SpecCost | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, SPEC_COST_FILE), 'utf-8')) as SpecCost;
  } catch {
    return undefined;
  }
}

/** Every spec under the package's tests, relative to the package */
export function specFiles(packageDir: string): string[] {
  const root = path.join(packageDir, 'tests');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.spec.ts') ? [path.relative(packageDir, full)] : [];
    });
  return walk(root).sort();
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

/** Specs with no recorded cost: a new one is unmeasured until `spec-cost:update` runs */
export const unrecorded = (costs: Record<string, number>, files: readonly string[]): string[] =>
  files.filter((file) => costs[file] === undefined);

/** Recorded specs that no longer exist */
export const stale = (costs: Record<string, number>, files: readonly string[]): string[] =>
  Object.keys(costs).filter((file) => !files.includes(file)).sort();
