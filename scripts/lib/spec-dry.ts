/**
 * Which specs a plan would run, without running them.
 *
 * The half of `npm run spec:dry` that is not the command — the same split as `spec-plan.ts` under `spec.ts`,
 * so a spec can drive both the listing and the collection without spawning anything. The whole module loads
 * behind an `await import` in the command, which is what keeps the ordinary run from paying for vitest's
 * node API or the chain steps the app label reads.
 *
 * **It used to predict a cost too, and does not any more.** It summed `spec-cost.json`, which recorded what
 * every spec cost in milliseconds; that record is gone, because the quantity it stored was not one number —
 * a spec read 2.8s in the fast pool and 0.64s in the integration pool, so each half's reading contradicted
 * the other. What the prediction was worth is also what it cost to keep: file-time summed across workers,
 * never a wall estimate, at a measured 1.55:1 and 2.18:1 ratio to the wall on one target three days apart.
 * The answer worth having is which specs run, and that needs no sample.
 */
import * as path from 'node:path';
import { CHAIN_STEPS , needsApp as needsAppStep } from './chain-steps.ts';
import { UNIT_SUITES } from './unit-suites.ts';
import { specFiles } from './spec-halves.ts';
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
