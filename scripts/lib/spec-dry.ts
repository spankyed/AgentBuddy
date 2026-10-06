/**
 * Which specs a plan would run, without running them.
 *
 * The half of `npm run spec:dry` that is not the command — the same split as `spec-plan.ts` under `spec.ts`,
 * so a spec can drive both the listing and the collection without spawning anything. The whole module loads
 * behind an `await import` in the command, which is what keeps the ordinary run from paying for vitest's
 * node API or the chain steps the app label reads.
 *
 * **It prices the plan from the last run on this machine**, and that is a different thing from what it used
 * to do. It summed `spec-cost.json`, a committed record of what every spec cost, compared across runs and
 * machines against a fixed edge; the quantity was not one number — a spec read 2.8s in the fast pool and
 * 0.64s in the integration pool — and nothing in the file said which machine it described. What it reads
 * now is a cache this machine's own last run wrote (`spec-durations.ts`), so there is no record to go
 * stale, nothing to re-record, and a fresh clone is simply unpriced rather than wrong.
 *
 * The caveat the old one carried is still true and still has to be said: this is **file time summed across
 * workers, never a wall estimate**. Measured on one target three days apart, the ratio between the two was
 * 1.55:1 and 2.18:1.
 */
import * as path from 'node:path';
import { CHAIN_STEPS , needsApp as needsAppStep } from './chain-steps.ts';
import { UNIT_SUITES } from './unit-suites.ts';
import { halfOfPath, specFiles } from './spec-halves.ts';
import { readDurationRuns, trendIn, type DurationRecord } from './spec-durations.ts';
import { IS_SPEC, type Run } from './spec-plan.ts';

/**
 * The specs a run names, checked against the promise `Run.specs` makes.
 *
 * A directory here is a producer that did not keep that promise. Refused rather than passed on, because the
 * caller prints this as "the specs that would run" and a directory in that list is a claim about files
 * nobody enumerated.
 */
export function checkedSpecs(specs: readonly string[]): readonly string[] {
  for (const rel of specs) {
    if (!IS_SPEC.test(rel)) {
      throw new Error(`${rel} is not a spec file, and Run.specs promises the spec files a run executes`);
    }
  }
  return specs;
}

/**
 * Every spec a whole-suite run would execute, walked from the packages it covers.
 *
 * The third thing a run's specs can come from, beside collecting and a named list — `--full`'s pack suite is
 * the largest run a plan produces and names none of its files. It read the cost record until 2026-10-05,
 * which held a row per spec and so doubled as the suite's inventory; `specFiles` is that inventory without
 * the millisecond, and is the walk the record was built from in the first place.
 */
export function specsOfSuites(workspaces: readonly string[], root: string): readonly string[] {
  const specs: string[] = [];
  for (const workspace of workspaces) {
    const suite = UNIT_SUITES.find((candidate) => candidate.workspace === workspace);
    // Named rather than skipped. Every `covers` today is derived from UNIT_SUITES, so this cannot fire — and
    // a `continue` here is a whole suite dropped from the answer in silence
    if (suite === undefined) throw new Error(`${workspace} is covered by a run but is no unit suite, so its specs cannot be listed`);
    for (const spec of specFiles(path.join(root, 'packages', suite.dir))) {
      specs.push(path.join('packages', suite.dir, spec));
    }
  }
  return checkedSpecs(specs);
}

/**
 * Whether the chain step a run corresponds to needs the built app, where it corresponds to one.
 *
 * Read from `chain-steps.ts` and never inferred from what a run looks like, so the label cannot disagree
 * with `check:tiers`. Only a run at the repo root invoking `npm run <script>` is one: a package's
 * `npm test` is that package's script, not the chain's `test` step, and labelling it as needing the app
 * would say the pack suite launches one.
 */
export const needsAppForRun = (run: Run, root: string): boolean | undefined => {
  if (!(run.cwd === root && run.command === 'npm' && run.args[0] === 'run')) return undefined;
  const step = CHAIN_STEPS.find((candidate) => candidate.name === run.args[1]);
  return step === undefined ? undefined : needsAppStep(step);
};

/**
 * The spec files a run would execute, asked of vitest without running them.
 *
 * **In the run's own root**, which is the pack's directory for a pack walk: a pack-relative `related` path
 * resolved from the repo root reaches the wrong tree and projects that do not include the pack, and
 * `spec:dry` answered 0 specs for a file the run answers with 3. That was guarded by a regex over the
 * command's source, which could see the call site and not the answer — this is here so a spec can ask for
 * the answer instead.
 */
export async function collectFor(run: Run, root: string): Promise<string[]> {
  if (run.collects === undefined) return [];
  const { createVitest } = await import('vitest/node');
  const vitest = await createVitest('test', {
    root: run.cwd, watch: false, silent: true,
    ...(run.collects.related === undefined ? {} : { related: [...run.collects.related] }),
    ...(run.collects.changed === true ? { changed: true } : {}),
  });
  try {
    const found = await vitest.getRelevantTestSpecifications();
    return [...new Set(found.map((spec) => spec.moduleId))].map((id) => path.relative(root, id)).sort();
  } finally {
    await vitest.close();
  }
}

export interface Priced {
  /** File time summed across workers for the specs this machine has measured, never a wall estimate */
  readonly ms: number;
  readonly priced: number;
  /** The specs no run on this machine has measured, named rather than counted as free */
  readonly unpriced: readonly string[];
  /** The oldest run any of these prices came from, so a reader can say how old the answer is */
  readonly measuredAt: string | undefined;
  /**
   * What each priced spec cost at the far end of the window, where it holds more than one reading.
   *
   * **This is where the window becomes readable.** The pools record ten runs for every spec and show a
   * trend for five — the slowest of a half — which is what keeps that output bounded and free of a
   * threshold. The ~349 fast-half specs under 500ms, any of which could double without entering a ranking,
   * had history and no way to see it. Here the caller named the spec, so there is nothing to threshold:
   * the question was asked about this one.
   */
  readonly trend: ReadonlyMap<string, { was: number; runs: number }>;
}

/**
 * What the specs a run would execute cost, from what the last run on this machine measured.
 *
 * A named bucket beside the total rather than a quiet sum: a spec nothing has measured here is listed, in
 * the shape the root `CLAUDE.md` gives for a partial result, because a fresh clone has measured nothing and
 * a total over three of twelve specs that does not say so is the wrong answer rather than a small one.
 */
export function pricedSpecs(specs: readonly string[], root: string): Priced {
  // The window per suite and half, read once: `trendIn` takes it, where `trendOf` would re-read the file
  // for every spec in the suite
  const windows = new Map<string, readonly DurationRecord[] | undefined>();
  const unpriced: string[] = [];
  let ms = 0;
  let priced = 0;
  let measuredAt: string | undefined;
  const trend = new Map<string, { was: number; runs: number }>();
  for (const spec of specs) {
    const parts = spec.split(path.sep === '\\' ? /[\\/]/ : '/');
    // A spec outside `packages/` belongs to no suite, so no pool measured it and no record could hold it
    const [, dir, ...rest] = parts[0] === 'packages' ? parts : [];
    const relative = rest.join('/');
    const half = halfOfPath(spec);
    const key = `${dir}\u0000${half}`;
    if (dir === undefined || relative === '') {
      unpriced.push(spec);
      continue;
    }
    if (!windows.has(key)) windows.set(key, readDurationRuns(root, dir, half));
    const window = windows.get(key);
    const record = window?.[0];
    const found = record?.ms[relative];
    if (record === undefined || found === undefined) {
      unpriced.push(spec);
      continue;
    }
    ms += found;
    priced += 1;
    const moved = trendIn(window, relative);
    if (moved !== undefined) trend.set(spec, moved);
    if (measuredAt === undefined || record.measuredAt < measuredAt) measuredAt = record.measuredAt;
  }
  return { ms, priced, unpriced, measuredAt, trend };
}
