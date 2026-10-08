/**
 * What the step timings say: the floor a lane count can reach, and whether a declared `seconds` is still
 * true. Separate from the scheduler because these are pure functions over the table and a run's results,
 * and separate from `scripts/chain.ts` because that module runs the chain when imported.
 */
import type { SchedulableStep } from './chain-schedule.ts';
import { type Machine, thisMachine, unmetRecordingConditions } from './core-budget.ts';
import { declaredShare, type TimeoutClass } from './step-timeouts.ts';

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
 * The smallest movement a recorded cost follows, in seconds.
 *
 * `chain --all --record` compares with `movedBeyondBand(declared, measured, SECONDS_FLOOR)`, so a
 * difference of a second or less never reaches the table whatever the band says. One constant with two
 * readers, like `BAND` above: the recorder, and `driftedSteps` below, which uses it to stay quiet about a
 * drift no record can follow.
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
 * `--record` writes it into the table, `declaredShare` makes 300s four times its `suite` rung, `outgrownRungs`
 * then names it as outgrown by construction, and `criticalPath` puts the deadline on the floor. Not one of them
 * is wrong about the number. The number is not a measurement.
 *
 * `recordTheCosts` already draws this line at the other end, for the same reason: "Under a second is not a
 * measurement of the step's work" — `packages:ensure` returns in 0.3s fresh and takes 14s when it builds. A
 * deadline is the same category and the worse one, being large rather than small, so it survives that filter
 * and lands in the table looking like a cost.
 *
 * **A step that failed without being killed is kept.** It ran and stopped early, so its time is real and under,
 * which `driftedSteps`' lower band exists for — and a failure's own output is what a reader goes to anyway.
 *
 * One function rather than a filter at each reader: the four of them share this map, and the one that forgot
 * would be the one writing a deadline into source.
 *
 * **Exercised against a real kill 2026-10-04, because no case can reach the composition.** `check:tiers` was
 * pointed at a hang and the chain run with `--all --record`: it was killed at 62.0s against its 60s `quick`
 * deadline, and `--record` — reached, not refused — reported *"every step cost what the table says, within the
 * band — nothing recorded"*. That sentence is only possible with the step excluded: against a declared 0.3s,
 * 62s is 61.7s outside a 1s band, so it would have been written as the cost. `outgrownRungs` said nothing
 * either, where 62s is 4.13 of that rung. One run, both readers.
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
 * Steps whose **measured** cost puts them past the rung they declare.
 *
 * **`declaredShare` is a bound on a declared number, and the band watching that number is looser than the
 * bound itself.** `driftedSteps` below speaks at twice the declared cost; the bound's own margin is smaller
 * than that for four steps, so a step can outgrow its rung in silence. Measured 2026-10-04:
 * `test:integration` declares 60s, which is 0.80 of its `suite` rung, and could reach 120s — 1.60 of the
 * rung — without a word. It read 67.3s in a chain run the same day while the table reported 0.80.
 *
 * The cause was two changes on one day: the band was loosened on the grounds that a deadline is a declared
 * class and `seconds` is "only a report", and `MAX_DECLARED_SHARE` made `seconds` a gate input. Both shipped.
 *
 * **Asked of the measurement, which is what `criticalPath` above already does and for the same reason** — its
 * floor was reported from `seconds` and was wrong by the table's drift. A run is the one place both numbers
 * exist: `chain-graph.spec.ts` can only ever see the declaration.
 *
 * **A report and not a gate.** A measurement at this threshold is noisy upward in a way the 2x band is not —
 * `driftReport` records 0 over-band events in 40 step runs, which says nothing about a 25% overrun — and
 * failing a run for it would manufacture the flake the ladder exists to prevent. What it feeds is the chain's
 * own pipeline: the report, then `--all --record`, then `chain-graph` failing on the new declaration, then the
 * step moving rung. Only the first was missing.
 *
 * A step already over on its *declaration* is left out: that is `chain-graph`'s to fail, and a run reaching
 * this report has a table that passed it.
 *
 * **It answers nothing off the schedule the table was measured on, which is not a politeness.**
 * `declaredShare` projects a cost onto a machine `stretches` times slower, so its input has to be a cost from
 * the machine the rungs were sized against. Hand it a reading from a slower box and the slowdown is counted
 * twice: measured 2026-10-04, a green run on the 4x-slower runner `suite`'s `stretches` cites puts **17 of 29
 * steps** past their rung, and at 2x it is 5 of 29 — every one of them a step whose declared cost is inside
 * its rung with room to spare. The percentage would be its share of a machine 16x the reference, which no
 * rung is sized for and nothing measured.
 *
 * So the gate is the machine and the budget — two of the three `RECORDING_CONDITIONS` that `--record`
 * refuses on — and that is what keeps this report's advice followable: it says to re-measure and record, and
 * it only speaks where recording is accepted. `driftReport` splits the two — its rows are true wherever
 * they ran, so it prints them anywhere and gates only the sentence. Neither of these two survives that
 * split, because the number itself is the projection.
 *
 * **It takes two of the three `RECORDING_CONDITIONS`, and skipping `wholeTable` is a decision.** The table
 * is written only under `--all`, so a partial run's timings are not the quantity the table holds — the
 * chain admits steps in parallel, and nine stale steps are a different schedule from thirty. The reason to
 * report anyway is an inequality: **contention can only make a step slower**, so a measurement is an upper
 * bound on the step's true cost. Read it off that:
 *
 * - `measured < threshold` proves `true < threshold` — a crowded run can **exonerate** a step.
 * - `measured > threshold` proves nothing on its own — a crowded run cannot **convict** one.
 *
 * Which means this report fires exactly where its evidence is one-sided, and no gate fixes that: silencing
 * it on partial runs would reopen the gap it exists to close, and for a narrow band that matters —
 * `test:integration` passes its rung at 75s (300s / 4) while `driftedSteps` says nothing until 120s, so
 * growth in between would surface only on the rare `--all` run. What the one-sidedness does constrain is
 * the *claim*: the row is this run's reading, the report leads with a quiet re-measurement that settles it
 * (`outgrownReport`), and a partial run says so in the row rather than being dropped or trusted.
 *
 * It was none of that until 2026-10-07, when it fired twice in one session against a step that had not
 * moved — 83s and then 100s in two crowded runs, against 47.7s median of 5 at 93% idle and 60s declared.
 *
 * **How to watch it fire, since no case can reach the composition.** Put a sleep in the npm script of a
 * step that declares a fraction of a second, long enough to pass its rung's `ms / stretches` — that keeps the
 * declared share far inside the bound while the measurement lands outside it, which is the one shape this
 * reports. Run the chain plainly, then lengthen the sleep so the step goes stale again and run it at a
 * `--cores` the table was not measured at. The first prints a row here beside `driftReport`'s; the second
 * prints `driftReport`'s alone.
 *
 * That second run is the gate, and it is what stops being true if the `blocking` line goes: the same
 * measurement that printed nothing starts naming a step, and no case below can say so. Restore the
 * script afterwards and check `git status` rather than remembering — and rebuild the published packages,
 * which a run stamps against whatever `package.json` held at the time.
 *
 * The recipe is here for `measurementsFrom`'s reason: `scripts/chain.ts` cannot be imported, so the cases
 * below and the `decision-mutations` entry cover this function, while only a command covers the line that
 * hands it a budget and a machine.
 */
export function outgrownRungs<S extends SchedulableStep & { readonly timeout?: TimeoutClass; readonly stretches?: number }>(
  steps: readonly S[],
  measuredMs: ReadonlyMap<string, number>,
  /** The run's core budget, which with the two machines is what says this is the schedule the table describes */
  budget: number,
  /**
   * The machine the table's costs were taken on (`MEASURED_ON`). Passed rather than imported, as
   * `driftReport` takes it and for the same reason: it keeps this module testable about a machine it is not
   * running on.
   */
  measuredOn: Machine,
  /** The box this is running on; `thisMachine()` where a caller has no reason to say */
  machine: Machine = thisMachine(),
  /**
   * Whether every step ran (`--all`), so the schedule is the one the table describes. Reported rather than
   * gated on — the doc above has the inequality that makes a partial run's reading worth printing — and
   * carried on each row so the report can say which kind of run produced it.
   */
  wholeTable = true,
  /** Which steps ran beside each one, for the row to report — see `driftedSteps` */
  peers: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Array<{ name: string; declared: number; measured: number; at: number; wholeTable: boolean; peers: number }> {
  // Two of the three conditions, naming the one left out rather than leaving it absent: a partial run is
  // reported with that caveat, where another machine or another budget makes the number meaningless
  const blocking = unmetRecordingConditions({ budget, measuredOn, machine, wholeTable })
    .filter((condition) => condition !== 'wholeTable');
  if (blocking.length > 0) return [];
  const found: Array<{ name: string; declared: number; measured: number; at: number; wholeTable: boolean; peers: number }> = [];
  for (const step of steps) {
    const ms = measuredMs.get(step.name);
    // A cached step cost no time, so it is evidence of nothing — `criticalPath` skips it for the same reason
    if (ms === undefined || step.timeout === undefined || step.seconds === undefined) continue;
    if (declaredShare(step.seconds, step.timeout, step.stretches) > 1) continue;
    const measured = Math.round(ms / 1000);
    const at = declaredShare(measured, step.timeout, step.stretches);
    if (at > 1) found.push({ name: step.name, declared: step.seconds, measured, at, wholeTable, peers: peers.get(step.name)?.size ?? 0 });
  }
  return found;
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
    // Nor one the record could not follow. Three steps declare under a second, and for those the band
    // above is crossed by a 1s measurement while `SECONDS_FLOOR` refuses to write it — so the report named
    // `check:tiers 0.3 -> 1` on every full run and the only thing it suggested, "re-measure, or record",
    // could not be done. Advice that cannot be taken teaches a reader to skip the report.
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
 * (`compile` into `src/__generated__`, the fixture check into each fixture's `dist`), and one step
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
