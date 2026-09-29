/**
 * What a plan would cost, read from the records rather than measured.
 *
 * The pure half of `npm run spec:dry`, here so a spec can assert the pricing without collecting anything —
 * the same split as `spec-plan.ts` under `spec.ts`. The collecting half is in the command, because it needs
 * vitest's node API and the ordinary run must not pay to load it.
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
import { packageOf, type Run } from './spec-plan.ts';

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

/** `41.9s`, or `1.2s`; the unit is always seconds, because a plan spanning ms and minutes reads as neither */
export const asSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
