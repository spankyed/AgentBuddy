/**
 * What a plan would cost, read from the records rather than measured.
 *
 * The half of `npm run spec:dry` that is not the command — the same split as `spec-plan.ts` under `spec.ts`,
 * so a spec can drive both the pricing and the collection without spawning anything. The whole module loads
 * behind an `await import` in the command, which is what keeps the ordinary run from paying for vitest's
 * node API or the chain steps the tier label reads.
 *
 * **What it predicts from is a sample, and it says so.** `spec-cost.json` is maintained with hysteresis: a
 * measurement is recorded only when it would place the spec in the other half or is a large move, so a row
 * is deliberately allowed to sit up to `DRIFT_SHARE` from the truth, and a correlated drift under
 * `SETTLED_FRACTION` moves no row at all (root `CLAUDE.md`, "There is a third kind"). A total summed from it
 * is a band, not a number. `measuredAt` is what says how old the band is, and it is the record's own field
 * rather than a second freshness signal computed here — a third reader of the same numbers is how two of
 * them come to disagree.
 *
 * **And it is file-time**, summed across workers, never a wall estimate. The ratio between the two was
 * 1.55:1 and 2.18:1 on the same target three days apart, so a wall number derived from either would be wrong
 * by a third within a week.
 */
import * as path from 'node:path';
import { CHAIN_STEPS } from './chain-steps.ts';
import { readSpecCost } from './spec-cost.ts';
import { UNIT_SUITES } from './unit-suites.ts';
import { IS_SPEC, packageOf, type Run } from './spec-plan.ts';

export interface Priced {
  /** Repo-relative, as given */
  readonly specs: readonly string[];
  /** Summed recorded milliseconds, over the specs that have one */
  readonly fileTimeMs: number;
  /** Specs a record could hold and does not, which `spec-cost:update` is the fix for */
  readonly unpriced: readonly string[];
  /**
   * Specs no record covers because they are in no unit suite — `tests/e2e/`, a package with no suite.
   *
   * Apart from `unpriced`, because the two take different advice and only one of them is anyone's to fix:
   * telling a reader to run `spec-cost:update` for an E2E spec sends them after a command that will never
   * record it.
   */
  readonly outside: readonly string[];
  /** The oldest `measuredAt` among the records this drew on, which is how old the band is */
  readonly measuredAt: string | undefined;
}

/**
 * What the record says a set of specs costs.
 *
 * An unrecorded spec is named, never treated as zero: a total that quietly omits a file is a prediction that
 * gets better the less it knows, which is the failure mode a prediction has.
 */
export function priceSpecs(specs: readonly string[], root: string): Priced {
  let fileTimeMs = 0;
  const unpriced: string[] = [];
  const outside: string[] = [];
  const dates: string[] = [];
  const records = new Map<string, ReturnType<typeof readSpecCost>>();
  const recorded = new Set(UNIT_SUITES.map((suite) => suite.dir));

  for (const rel of specs) {
    // A directory here is a producer that did not keep `Run.specs`' promise, and it has a cost record with no
    // row for it — so it would land in `unpriced` and advise `spec-cost:update`, a command that can never
    // record one. Refused rather than mis-bucketed, as `priceSuites` refuses an unknown workspace below and
    // for the same reason: what silence costs here is a whole run priced at zero
    if (!IS_SPEC.test(rel)) {
      throw new Error(`${rel} is not a spec file, and Run.specs promises the spec files a run executes`);
    }
    const dir = packageOf(rel);
    if (dir === null || !recorded.has(dir)) { outside.push(rel); continue; }
    if (!records.has(dir)) records.set(dir, readSpecCost(root, dir));
    const record = records.get(dir);
    const cost = record?.costs[path.relative(path.join('packages', dir), rel)];
    if (cost === undefined) unpriced.push(rel);
    else { fileTimeMs += cost; if (record !== undefined) dates.push(record.measuredAt); }
  }
  return { specs, fileTimeMs, unpriced, outside, measuredAt: dates.sort()[0] };
}

/**
 * What a whole-suite run costs: everything its record holds.
 *
 * The third thing a run's cost can be read from, beside collecting and a named list. Without it `--full`'s
 * pack suite — the most expensive run a plan produces — contributes nothing to the total, which understates
 * the prediction exactly where it matters most.
 */
export function priceSuites(workspaces: readonly string[], root: string): Priced {
  const specs: string[] = [];
  for (const workspace of workspaces) {
    const suite = UNIT_SUITES.find((candidate) => candidate.workspace === workspace);
    // Named rather than skipped. Every `covers` today is derived from UNIT_SUITES, so this cannot fire — and
    // a `continue` here is a whole suite dropped from a total in silence, which is the failure the unpriced
    // list exists to prevent, one level up
    if (suite === undefined) throw new Error(`${workspace} is covered by a run but is no unit suite, so its cost cannot be read`);
    const record = readSpecCost(root, suite.dir);
    for (const spec of Object.keys(record?.costs ?? {})) specs.push(path.join('packages', suite.dir, spec));
  }
  return priceSpecs(specs, root);
}

/**
 * The tier of the chain step a run corresponds to, where one does.
 *
 * Read from `chain-steps.ts` and never inferred from what a run looks like, so the label cannot disagree with
 * `check:tiers`. Only a run at the repo root invoking `npm run <script>` is one: a package's `npm test` is
 * that package's script, not the chain's `test` step, and labelling it tier 3 would say the pack suite
 * launches the app.
 */
export const tierOfRun = (run: Run, root: string): number | undefined =>
  run.cwd === root && run.command === 'npm' && run.args[0] === 'run'
    ? CHAIN_STEPS.find((step) => step.name === run.args[1])?.tier
    : undefined;

/**
 * `41.9s`, `1.2s`, or `7ms` below a second.
 *
 * Seconds is the unit wherever a plan's runs are worth comparing, which is what keeps one spanning ms and
 * minutes from reading as neither. The exception is below a second, where one decimal renders every total
 * as `0.0s` — the same string a run with nothing recorded prints, and the two mean opposite things. A
 * recorded 3ms and an unrecorded spec were indistinguishable, so the comparison that rounding protects is
 * the one thing a reader could not do.
 */
export const asDuration = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;

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
