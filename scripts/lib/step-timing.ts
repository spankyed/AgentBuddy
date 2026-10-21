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
 * Where a declared cost has stopped describing the step: past double, or under half.
 *
 * The band is wide on purpose. Two lanes, a warm page cache and a loaded laptop move a step's time a long
 * way, and a warning that fires on ordinary variance is one people learn to skip. Half to double is where
 * the number has stopped being useful as a report, which since 2026-10-03 is all it is: a deadline is a
 * declared class and no longer a multiple of this number, so nothing is killed for drifting.
 *
 * One constant with two readers — `driftedSteps` below, which wants both sides, and `howLong` in
 * chain-output.ts, which wants only the slow one to decide whether a failure is worth blaming on contention.
 * Written twice they drift apart silently, and the reasoning for the width lives here in one place.
 */
export const BAND = 2;

/** Slower than a declared cost still describes */
export const overBand = (declared: number, measured: number): boolean => measured > declared * BAND;

/**
 * The smallest movement worth reporting, in seconds.
 *
 * Read by `driftedSteps` below, which stays quiet about a drift this small whatever the band says: three
 * steps declare under a second, so for those the band is crossed by a one-second reading that means nothing.
 *
 * A second rather than a fraction because these are seconds, and a fraction of a sub-second number chases
 * noise — `check:tiers` declares 0.3s.
 */
export const SECONDS_FLOOR = 1;

/**
 * What a run measured, which is not every step's elapsed time.
 *
 * **A killed step's time is its deadline, not its cost.** `boundedSpawn` returns when the budget runs out, so a
 * wedged `test:integration` reports ~300s — and every reader of this map takes what it holds for a measurement:
 * the drift report offers it as an edit and `criticalPath` puts the deadline on the floor. Neither is wrong
 * about the number. The number is not a measurement.
 *
 * `SECONDS_FLOOR` draws this line at the other end, for the same reason: under a second is not a measurement
 * of the step's work — `packages:ensure` returns in 0.3s fresh and takes 14s when it builds. A
 * deadline is the same category and the worse one, being large rather than small, so it survives that filter
 * and lands in the table looking like a cost.
 *
 * **A step that failed without being killed is kept.** It ran and stopped early, so its time is real and under,
 * which `driftedSteps`' lower band exists for — and a failure's own output is what a reader goes to anyway.
 *
 * One function rather than a filter at each reader: they share this map, and the one that forgot
 * would be the one writing a deadline into source.
 *
 * **Exercised against a real kill 2026-10-04, because no case can reach the composition.** `check:tiers` was
 * pointed at a hang and the chain run with `--all`: it was killed at 62.0s against its 60s `quick`
 * deadline, and the report — reached, not refused — said *"every step cost what the table says, within the
 * band — nothing recorded"*. That sentence is only possible with the step excluded: against a declared 0.3s,
 * 62s is 61.7s outside a 1s band, so it would have been written as the cost.
 *
 * The note is here because `scripts/chain.ts` cannot be imported, which is `recordTheCosts`' reason for
 * carrying the same kind of record: a command is how that composition is checked, and a dated note is the only
 * place a reader learns it has been. The unit cases below and the `decision-mutations` entry cover this
 * function; what the run covered is the line in `chain.ts` that hands `timedOut` to it.
 */
export const measurementsFrom = (
  results: readonly { readonly step: string; readonly ms: number; readonly timedOut?: true }[],
): Map<string, number> =>
  new Map(results.filter((result) => result.timedOut !== true).map((result) => [result.step, result.ms]));

/**
 * Declared `seconds` that a run has contradicted.
 *
 * The field feeds two things — the kill budget (four times it) and the critical path — and nothing kept it
 * honest, so it drifted both ways: `packages:ensure` said 1s for a step that takes 14s when it actually
 * builds, and `test:unit:apack-sdk` said 25s for one measured at 14s. A number nobody re-measures is a
 * number that quietly stops meaning anything, so the chain says when its own table has gone stale, and
 * prints the value to record. Reported rather than enforced: a slow machine should not fail a run.
 *
 * Asked only of a run that did all the work at the measured schedule — `driftReport` in chain-output.ts holds
 * that gate. A step's time says nothing about the table otherwise: a pooled step may have run two of eleven
 * projects, and, measured, `typecheck` takes 12s in a chain with nine steps cached against 27s in a full one,
 * so an incremental run at the default lane count reported it as drifted by more than half.
 *
 * A step that finished in under a second is left alone, and that is not a rounding nicety. `seconds` is
 * what a step costs *when it does its work*, and a step can run having nothing to do: `packages:ensure`
 * with the packages fresh returns in 0.4s. Reporting that as drift told the first run of this to record
 * `seconds: 14 -> 0` — the cached cost, which is the exact confusion this field was corrected for.
 */
export function driftedSteps<S extends SchedulableStep>(
  steps: readonly S[],
  measuredMs: ReadonlyMap<string, number>,
  /**
   * Which steps ran beside each one (`ScheduleResult.peers`), carried onto the row so the report can say how
   * contended the reading was.
   *
   * **It labels and never filters**, which is the distinction worth keeping: `seconds` is what a step costs
   * *under the chain's own admission* (`ChainStep.seconds`), so a reading taken beside peers is the right
   * quantity and dropping it would be dropping the measurement. What a reader cannot see without this is how
   * *much* contention produced it — `test:integration` read 77s, 88s, 96s and 101s across four runs of one
   * unchanged step, and the spread is the peer count. An unexplained spread is what gets a true row ignored.
   */
  peers: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Array<{ name: string; declared: number; measured: number; peers: number }> {
  const drifted: Array<{ name: string; declared: number; measured: number; peers: number }> = [];
  for (const step of steps) {
    const ms = measuredMs.get(step.name);
    if (ms === undefined || step.seconds === undefined) continue;
    const measured = Math.round(ms / 1000);
    if (measured < 1) continue;
    // Nor one too small to mean anything. Three steps declare under a second, and for those the band above
    // is crossed by a 1s reading — so the report named `check:tiers 0.3 -> 1` on every full run, offering an
    // edit that would replace one arbitrary sub-second number with another. Advice that cannot be acted on
    // teaches a reader to skip the report.
    if (Math.abs(measured - step.seconds) <= SECONDS_FLOOR) continue;
    if (overBand(step.seconds, measured) || measured < step.seconds / BAND) {
      drifted.push({ name: step.name, declared: step.seconds, measured, peers: peers.get(step.name)?.size ?? 0 });
    }
  }
  return drifted;
}

/**
 * Steps that passed and still would not be cached next run.
 *
 * A step stamps the fingerprint it was dispatched with; if recomputing it straight afterwards gives a
 * different answer, something wrote into that step's declared inputs *after* it ran. That is a whole class
 * of defect, and this repo has now produced it three ways: a step writing under a tree it also declares
 * (`build:default-setup` into `src/__generated__`, the fixture check into each fixture's `dist`), and one step
 * writing under a tree another declares (the E2E suite into `tests/screenshots`, which `typecheck` read as
 * part of `tests` — that one cost 34s of every warm chain and was invisible until someone asked why a
 * "15 of 17 cached" run still took 34 seconds).
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
