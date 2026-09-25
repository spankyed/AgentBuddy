/**
 * What the step timings say: the floor a lane count can reach, and whether a declared `seconds` is still
 * true. Separate from the scheduler because these are pure functions over the table and a run's results,
 * and separate from `scripts/chain.ts` because that module runs the chain when imported.
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
    // Undefined rather than a zero, so a need that costs nothing still lands on the path. Seeding this with
    // `{ seconds: 0 }` drops every unmeasured step from the report, since nothing is greater than zero.
    let longest: { names: string[]; seconds: number } | undefined;
    for (const need of step.needs) {
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
 * Declared `seconds` that a run has contradicted.
 *
 * The field feeds two things — the kill budget (four times it) and the critical path — and nothing kept it
 * honest, so it drifted both ways: `packages:ensure` said 1s for a step that takes 14s when it actually
 * builds, and `test:unit:abuddy-sdk` said 25s for one measured at 14s. A number nobody re-measures is a
 * number that quietly stops meaning anything, so the chain says when its own table has gone stale, and
 * prints the value to record. Reported rather than enforced: a slow machine should not fail a run.
 *
 * The band is wide on purpose. Two lanes, a warm page cache and a loaded laptop move a step's time a long
 * way, and a warning that fires on ordinary variance is one people learn to skip. Half to double is where
 * the number has stopped being useful — at four times, `budgetFor` starts killing healthy steps.
 *
 * A step that finished in under a second is left alone, and that is not a rounding nicety. `seconds` is
 * what a step costs *when it does its work*, and a step can run having nothing to do: `packages:ensure`
 * with the packages fresh returns in 0.4s. Reporting that as drift told the first run of this to record
 * `seconds: 14 -> 0` — the cached cost, which is the exact confusion this field was corrected for.
 */
export function driftedSteps<S extends SchedulableStep>(
  steps: readonly S[],
  measuredMs: ReadonlyMap<string, number>,
): Array<{ name: string; declared: number; measured: number }> {
  const drifted: Array<{ name: string; declared: number; measured: number }> = [];
  for (const step of steps) {
    const ms = measuredMs.get(step.name);
    if (ms === undefined || step.seconds === undefined) continue;
    const measured = Math.round(ms / 1000);
    if (measured < 1) continue;
    if (measured > step.seconds * 2 || measured < step.seconds / 2) {
      drifted.push({ name: step.name, declared: step.seconds, measured });
    }
  }
  return drifted;
}
