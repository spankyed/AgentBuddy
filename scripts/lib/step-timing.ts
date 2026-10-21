/**
 * What the step timings say: the floor a lane count can reach, what a run measured, and which passing steps
 * are already stale. Pure functions over the table and a run's results, separate from `scripts/chain.ts`
 * because that module runs the chain when imported.
 */
import type { SchedulableStep } from './chain-schedule.ts';

/**
 * The longest chain of steps by `seconds`: the floor on wall time however many lanes there are. Reported so
 * a disappointing parallel run is legible — if the critical path is most of the serial total, lanes were
 * never going to help, which is an answer rather than a tuning problem.
 */
export function criticalPath<S extends SchedulableStep>(steps: readonly S[]): { names: string[]; seconds: number } {
  const byName = new Map(steps.map((step) => [step.name, step]));
  const memo = new Map<string, { names: string[]; seconds: number }>();
  const walk = (step: S): { names: string[]; seconds: number } => {
    const seen = memo.get(step.name);
    if (seen) return seen;
    // Undefined rather than a zero, so a need that costs nothing still lands on the path. Applying this with
    // `{ seconds: 0 }` drops every unmeasured step from the report, since nothing is greater than zero.
    let longest: { names: string[]; seconds: number } | undefined;
    for (const need of step.dependsOn) {
      // A need outside `steps` contributes nothing: this is called with the steps that actually ran, and one
      // that was cached cost no time, so it is on no path worth reporting
      const needed = byName.get(need);
      if (!needed) continue;
      const path = walk(needed);
      if (!longest || path.seconds > longest.seconds) longest = path;
    }
    const before = longest ?? { names: [], seconds: 0 };
    const here = { names: [...before.names, step.name], seconds: before.seconds + (step.seconds ?? 0) };
    memo.set(step.name, here);
    return here;
  };
  return steps.map(walk).reduce((best, path) => (path.seconds > best.seconds ? path : best), { names: [] as string[], seconds: 0 });
}

/**
 * What a run measured, which is not every step's elapsed time.
 *
 * **A killed step's time is its deadline, not its cost.** `boundedSpawn` returns when the budget runs out, so
 * a wedged `test:integration` reports its deadline — and a reader of this map takes what it holds for a
 * measurement: `criticalPath` would put the deadline on the floor, and the duration window would record it
 * as what the step costs. One function rather than a filter at each reader, so none can forget.
 *
 * A step that failed without being killed is kept: it ran and stopped early, so its time is real. The window
 * takes only passing steps (`chain.ts`), and the run's critical path takes every step that ran.
 */
export const measurementsFrom = (
  results: readonly { readonly step: string; readonly ms: number; readonly timedOut?: true }[],
): Map<string, number> =>
  new Map(results.filter((result) => result.timedOut !== true).map((result) => [result.step, result.ms]));

/**
 * Steps that passed and still would not be cached next run.
 *
 * A step stamps the fingerprint it was dispatched with; if recomputing it straight afterwards gives a
 * different answer, something wrote into that step's declared inputs *after* it ran. That is a whole class
 * of defect, in two shapes: a step writing under a tree it also declares (`build:default-setup` into
 * `src/__generated__`), and one step writing under a tree another declares (an E2E suite writing under
 * `tests` while a typecheck reads it), which silently costs every warm chain that step's whole run.
 *
 * Checked by running rather than by reading, on purpose. A static rule needs a model of what each process
 * touches, and the thing that keeps being wrong *is* that model — the tool that writes somewhere nobody
 * expected is exactly the case a declaration cannot anticipate. Recomputing a hash catches it whatever
 * wrote there and whyever.
 *
 * Reported, not failed: a step that will not cache is slow, not wrong, and a chain that goes red for
 * slowness teaches people to ignore it.
 *
 * **That argument covers one of the two cases this finds, and the chain splits them.** A file that moved
 * *after* the step finished is the slowness above — the next run pays for it and nothing is wrong. A file
 * that moved *while it ran* is a different claim: the step read a tree that no longer exists, so its pass
 * establishes nothing. This function cannot tell them apart, because it compares fingerprints and a
 * fingerprint says that something moved and never when; `whenChanged` in `chain-output.ts` is what places a
 * change, and `chain.ts` fails on the second under `--strict`.
 */
export function willNotCache<S extends { name: string; neverCachedBecause?: string }>(
  steps: readonly S[],
  passed: ReadonlySet<string>,
  stillStale: (step: S) => string | null,
): Array<{ name: string; reason: string }> {
  const bad: Array<{ name: string; reason: string }> = [];
  for (const step of steps) {
    // The E2E suite opts out of caching, so its fingerprint moving means nothing
    if (step.neverCachedBecause !== undefined || !passed.has(step.name)) continue;
    const reason = stillStale(step);
    if (reason !== null) bad.push({ name: step.name, reason });
  }
  return bad;
}
