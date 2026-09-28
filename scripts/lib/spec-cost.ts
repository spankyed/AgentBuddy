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
 * How far a new measurement must move before it replaces the recorded one.
 *
 * A cost is a **sample**, not a derivation: re-running the measurement does not reproduce it. Measured over
 * two runs on an idle machine, 125 of 163 entries changed — median drift 10-18%, p90 50-75% — because 304 of
 * the 366 specs are under 500ms, where a few milliseconds is a large *relative* change. Recording every
 * sample therefore rewrote most of the file every time, and a real movement had nowhere to be seen.
 *
 * Wider than that jitter, far narrower than the 1 000ms band between `FAST_BELOW_MS` and
 * `INTEGRATION_ABOVE_MS`, so a spec that genuinely crosses is still recorded and still reported. Modelled
 * against the same two runs: one entry of 163 moves, against 125 before.
 *
 * It compounds rather than hides a slow creep: the tolerance is relative to the *recorded* value, which stays
 * put, so 400 -> 480 -> 576 exceeds it on the third step rather than never.
 */
export const SETTLED_MS = 500;
export const SETTLED_FRACTION = 0.5;

/**
 * Whether a fresh measurement says something the record does not already say.
 *
 * Two clauses, and the first is why the second can be loose. A cost is only *consulted* to place a spec in a
 * half, so a measurement that would place it differently is always recorded, exactly. Everything else is a
 * number a human reads, and there the record only has to stay roughly true — which is what lets a spec with
 * real variance stop rewriting the file. `generated-behind-contract` runs codegen over a temp pack and swings
 * 714-995ms between idle runs; both are far below the band, and neither says anything the other does not.
 */
export const moved = (file: string, recorded: number | undefined, measured: number): boolean => {
  if (recorded === undefined) return true;
  if (halfFor(file, measured) !== halfFor(file, recorded)) return true;
  return Math.abs(measured - recorded) > Math.max(SETTLED_MS, SETTLED_FRACTION * recorded);
};

/**
 * The share of a suite's entries that may move before the run is read as measuring the machine.
 *
 * This is the check a sample can have. A derivation's is equality and a proxy's is a self-check against the
 * real thing; neither is available here, and what is left is reproducibility. With the tolerance above, an
 * idle run moves 0-3% of a suite; a contended one moved 76%. The file's own instruction to "run the update
 * with nothing else on the machine" was prose until this, and was ignored twice in one day.
 */
export const CONTENDED_SHARE = 0.25;

/** The guard that reads this record. It is the one spec that skips itself while the record is rewritten. */
export const PLACEMENT_GUARD = 'tests/suite-split.spec.ts';
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
/**
 * Which config runs each half, as one declaration rather than two lists that can disagree.
 *
 * `configsFor` derives its order from this, and naming a spec derives its config from it the other way —
 * which is what lets `spec-cost:update <path>` run the half that spec lives in instead of the whole suite.
 */
export const CONFIG_BY_HALF: Readonly<Record<Half, string>> = {
  fast: 'vitest.config.ts',
  integration: 'vitest.integration.config.ts',
};

export function configsFor(packageDir: string): string[] {
  return Object.values(CONFIG_BY_HALF).filter((file) => fs.existsSync(path.join(packageDir, file)));
}

/**
 * The configs that must run to measure these specs: each one's half, and nothing else.
 *
 * A spec measured on its own is not comparable to one measured beside its siblings — `chain-inputs` reads
 * 1688ms in its config and 963ms alone, against a band 1000ms wide — so the unit is the config, never the
 * file. A half whose config is missing falls back to everything the package has, since the spec still has to
 * be measured somewhere.
 */
export function configsOf(packageDir: string, specs: readonly string[]): string[] {
  const all = configsFor(packageDir);
  const wanted = new Set(specs.map((spec) => CONFIG_BY_HALF[halfOfPath(spec)]));
  const known = all.filter((config) => wanted.has(config));
  return known.length === wanted.size ? known : all;
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
// `templates` holds the CLI's scaffold: `templates/pack/tests/*.spec.ts` is a spec a pack author will run,
// not one of this package's, and vitest's own `include` already leaves it out
const IGNORED = new Set(['node_modules', 'dist', 'etc', 'coverage', 'templates']);
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
