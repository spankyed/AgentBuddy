// What of the machine each chain step takes, so one scheduler can admit them on cores.
//
// The chain has had a scheduler for steps since `chain-schedule.ts` and none for cores: `--lanes 3` meters
// a single-threaded `tsc` leg and a nine-worker vitest pool as one unit each. Measured 2026-10-02 on a
// 10-core box, that is 3 of 10 cores through the typecheck phase and 18 workers on 10 through the test
// phase — the same two-schedulers problem `chain-steps.ts` names over `TYPECHECK_STEPS`, which flattening
// the legs fixed for their *scheduling* and left standing for the pools' *sizing*.
//
// **Nothing here imposes a width; every entry describes one.** `test:integration` caps itself in its own
// config and the two unit pools take vitest's default. Those configs stay literal, which they have to:
// `check:specifiers` reads them as text and cannot read a computed value. So this table is a second record
// of a fact, and the kind that re-takes its answer — `core-budget.spec.ts` holds every entry to the config
// it describes, so a cap that moves fails there rather than drifting from here.
//
// A **share** of the box rather than a core count, so an entry means the same thing on any machine and a
// case about it is not about the box it ran on.

import * as os from 'node:os';

/**
 * This machine's usable cores.
 *
 * `availableParallelism` rather than `cpus().length`, which counts the host's where this reads a
 * container's quota. `scripts/test-unit.ts` already chooses it the same way.
 */
export const box = (): number => os.availableParallelism?.() ?? os.cpus().length;

/**
 * A pool that sets no cap, and so takes vitest's default of one less than the box.
 *
 * Declared as the default rather than as a share, because `(cpus - 1) / cpus` is not one number: 0.9 on
 * ten cores, 0.875 on eight. What such an entry claims is that its config sets *nothing*, and that is the
 * half a check can hold it to.
 */
export const UNCAPPED = Symbol('vitest default: one less than the box');

/**
 * What a step takes: a share of the box, a fixed number of cores, or vitest's uncapped default.
 *
 * **The distinction is load-bearing, not cosmetic.** A worker pool told to take half the cores takes half
 * of whatever box it finds, so its entry is a `share`. A bundler given a fixed amount of work uses about
 * the same number of cores wherever it runs — `build:app` is a measured 2.2 on ten — so a `share` would
 * have the chain believe it takes 4.4 on twenty and over-budget everything beside it. Writing both as a
 * bare number was the first version of this table, and it was wrong in that direction.
 */
export type PoolWidth = { readonly share: number } | { readonly cores: number } | typeof UNCAPPED;

/**
 * What each step's inner pool takes. A step with no entry takes one core.
 *
 * Absent is the common case and the right one: nineteen of the twenty-nine steps are one `tsc` or one
 * `node`, and `SIZE_MS`'s precedent (`unit-suites.ts`) is that a list whose every entry is the same value
 * is one nobody maintains. An entry is a claim about a pool, and something has to stand behind it.
 *
 * **`build:app` and `compile` are the two entries nothing declares**, so they are measured rather than
 * described, and that distinction is why they were left out until the admission policy became the default
 * — which was the condition, and it is met. Without them both weighed one core while vite and esbuild
 * fork, so the chain over-admitted beside the two steps on its critical path.
 *
 * What stands behind a measured entry, given this table has neither the hysteresis nor the busy-machine
 * refusal `spec-cost.json` carries: **an integer core count is its own band.** 1.6 and 2.2 both round to
 * two, so the jitter that hysteresis exists to absorb cannot move either one, and a scheduling weight
 * wrong by 0.4 of a core changes an admission only where it sits on the budget's boundary. A third such
 * entry needs the same argument made for it — the rounding has to do the work, not the measurement — and
 * `core-budget.spec.ts` can only hold the declared kind to its config, never this kind to anything.
 */
export const POOL_WIDTH: Readonly<Record<string, PoolWidth>> = {
  'test:unit:host': UNCAPPED,
  'test:unit:pack': UNCAPPED,
  'test:integration': { share: 0.5 },
  // **Measured as CPU time over wall time, 2026-10-02, two runs each**: `compile` 21.5s of CPU in 13.6s
  // and 21.2s in 13.1s, so 1.6 cores; `build:app` 62.9s in 29.0s and 61.2s in 27.6s, so 2.2. Both round
  // to two.
  //
  // That instrument rather than sampling the machine, and the reason is worth keeping: idle sampling could
  // not separate the step from a box that would not go below 2.4 cores busy, and subtracting the baseline
  // gave `compile` 1.8 cores on one run and 2.7 on the next. A process's own CPU time does not care what
  // else is running. It does assume the work is awaited — a step that detaches a child would read low,
  // and neither of these does.
  compile: { cores: 2 },
  'build:app': { cores: 2 },
};

/**
 * What a step takes of `cores`, which defaults to this machine's.
 *
 * The parameter is what lets a case ask about a ten-core box from an eight-core one. These are the
 * scheduler's weights, and a weight that moves with the machine is one no case can pin.
 */
export function coresFor(step: string, cores: number = box()): number {
  const width = POOL_WIDTH[step];
  if (width === undefined) return 1;
  if (width === UNCAPPED) return Math.max(1, cores - 1);
  // Clamped, because a weight larger than the machine would make the budget soft for that step alone and
  // admit it beside anything — the one thing a declared width is there to prevent
  if ('cores' in width) return Math.max(1, Math.min(width.cores, cores));
  return Math.max(1, Math.round(width.share * cores));
}

/**
 * What identifies the machine a measurement was taken on.
 *
 * **The core count alone is not an identity, which is the hole this closed.** A recorded table used to be
 * keyed by `cores` and nothing else, so every 10-core machine read as the one the numbers came from — an
 * M4 Pro, a 10-core Xeon, any of them. A second developer on a 10-core Mac, which is the commonest shape
 * there is, therefore got `--record` accepted, the drift report's instruction printed, and `spec-cost`'s
 * placement gate enforced, against a table measured on different silicon. That is the exact failure the
 * machine-portability work was for, surviving for one very common machine.
 *
 * The CPU model is the cheapest thing that distinguishes them and it is already to hand. It is not a
 * perfect identity — two machines can share a model string and differ in thermals or memory — but it
 * separates the case that actually turns up, and a run can check it.
 */
export interface Machine {
  /** `os.cpus()[0].model`, trimmed — "Apple M1 Pro" here */
  readonly cpu: string;
  /** What `box()` reports, which is what a budget is spent out of */
  readonly cores: number;
}

/** This machine, as a recorded one is written */
export const thisMachine = (): Machine => ({
  cpu: (os.cpus()[0]?.model ?? 'unknown').trim(),
  cores: box(),
});

/** How a machine reads in a message */
export const machineText = (machine: Machine): string => `${machine.cpu} with ${machine.cores} cores`;

/**
 * Whether this is the machine a record was measured on.
 *
 * **The CPU as well as the core count**, because the core count alone called every ten-core box the measured
 * one. It is the question a record of *costs* asks — a millisecond says where a spec belongs only against
 * edges chosen for one machine's speed — and it carries no budget, because a cost record has none.
 *
 * The machine is a parameter with a default so a case can ask about another box from this one, which is the
 * only way the off-machine paths are testable at all.
 */
export const isMeasuredMachine = (measuredOn: Machine, machine: Machine = thisMachine()): boolean =>
  machine.cores === measuredOn.cores && machine.cpu === measuredOn.cpu;

/**
 * Whether this run is the schedule a recorded cost table describes: the machine above, **and** the budget.
 *
 * **Three facts, because fewer have each let something through.** A run's admission is its budget; the
 * widths it admits on are resolved against the machine, because `coresFor` reads `box()` and not the budget
 * — `--cores` is a cap on what to spend of this box, not a pretend box (`budgetFrom`, `scripts/chain.ts`).
 * So the budget has to match the cores the table was measured at, *and* the machine has to be the one it was
 * measured on.
 *
 * Comparing the budget alone passed `--cores 10` on a twenty-core machine, where every width was
 * twenty-core sized. Comparing the budget and the core count passed any 10-core machine at all.
 *
 * A caller with no schedule in the question wants `isMeasuredMachine`: passing the measured cores *as* the
 * budget to satisfy a conjunct you do not care about reads as a fact about a budget, and `spec-cost` did it.
 */
export const isMeasuredSchedule = (
  budget: number,
  measuredOn: Machine,
  machine: Machine = thisMachine(),
): boolean => scheduleMismatch(budget, measuredOn, machine) === undefined;

/**
 * *Which* of the two facts above does not hold, for a caller that has to say something different about each.
 *
 * **A boolean hid the reason and every caller took the conjunction apart again.** `chain.ts` did exactly
 * that to decide whether `--adopt` was sensible advice, and got it wrong: the refusal fires for a budget
 * mismatch too, and there `--adopt` would write the machine the table already names and then be refused for
 * the budget. Advice nobody can act on is the defect this cost model was being reworked to remove.
 *
 * The machine is reported first because it is the one a flag can do something about; a budget mismatch is
 * the caller's own argument.
 *
 * **The second subject is what retires a hand-written variant.** "Can this machine claim the table" is this
 * same question asked of `thisMachine()` — the machine conjunct is trivially true against itself, leaving
 * `budget === box()`, which `chain.ts` had spelled out by hand three lines from a comparison against
 * `measuredOn.cores`. Two budget comparisons against two core counts is the near-duplicate that drifts.
 */
export const scheduleMismatch = (
  budget: number,
  measuredOn: Machine,
  machine: Machine = thisMachine(),
): 'machine' | 'budget' | undefined => {
  if (!isMeasuredMachine(measuredOn, machine)) return 'machine';
  return budget === measuredOn.cores ? undefined : 'budget';
};

/**
 * How much slower a smaller machine is, for anything that has to reason about one.
 *
 * **Measured, and about one kind of work.** A vitest pool dropping from nine workers to about two on a hosted
 * runner is three to four times slower (`docs/archive/plans/costs-across-machines.md`). That is a *pool*
 * losing workers and nothing else: serial work stretches less and a single compiler less again, neither has
 * been measured, so four is the worst case rather than the typical one.
 *
 * **Which means it describes one rung of the timeout ladder.** `TIMEOUT_MS`' `suite` cites this as its own
 * factor; the other two borrow it and say so, so that an assumption stays visible as one. Until 2026-10-03
 * there was no per-rung factor and this one number was answering three questions, with nothing at any call
 * site saying which it had been measured for — so a figure about pools was bounding eighteen single
 * compilers while reading as a property of machines.
 *
 * **Here rather than beside the ladder it sizes**, because it is a fact about machines and this module is
 * where those live. Filed under timeouts it was unfindable from the other question that needs it: `spec-cost`
 * reasons about a box three times slower in its own prose, and nothing tied the two figures together.
 */
export const SLOWER_MACHINE = 4;


/**
 * The machine the chain's `seconds` (`chain-steps.ts`) were measured on, and the budget they were
 * measured under.
 *
 * **It lives here rather than beside that table**, which is where it was until a leaf had to ask the
 * question. `scripts/bounded.ts` is a shell wrapper that kills a command on a class and has no step
 * record; to say whether an overrun means wedged it needs this box's identity and nothing else about the
 * chain. Importing the step table for it made three steps fail `chain-table`'s stamp-reader check, which
 * reads a runner's text — the names were in their reach without being in their behaviour, which is the
 * reason `check:tiers` is already excepted there, and three more exceptions for one import is the check
 * telling you the import is wrong. `record-seconds.ts` writes this and the costs in one operation still;
 * it already addressed them as two locations (`MACHINE_ANCHOR` beside `SECONDS_TABLES`), so that is where
 * the move is a single line.
 *
 * The cores are both facts at once, because the chain's default budget *is* the box (`budgetFrom`,
 * scripts/chain.ts). A step's cost depends on what runs beside it, so the table is only true of one
 * schedule, and this is what names it: a run on another machine says the numbers are about another one.
 *
 * **The CPU is here because the core count alone is not an identity.** This was `MEASURED_AT_CORES = 10`
 * until 2026-10-03, so every 10-core machine read as the one these numbers came from, and a second
 * developer on a 10-core Mac got `--record` accepted and `spec-cost`'s placement gate enforced against a
 * table measured on different silicon. `isMeasuredSchedule` has the rest.
 *
 * **Nothing here bounds anything, which is the point and was not true a day ago.** Each of these used to
 * become a kill deadline at four times, so a smaller machine ran this machine's deadlines over slower
 * steps with the four-times margin as the only slack. Deadlines are declared classes now
 * (`step-timeouts.ts`), so what a wrong number on another box costs is a misleading report and never a
 * killed step.
 *
 * **It makes an implicit fact explicit.** These costs were always measured on one box and nothing recorded
 * which. The hazard it was written for is the same either way: `seconds: 45` for `typecheck` was taken
 * 2026-09-25 at 07:38 under one admission policy, the default changed at 09:30 the same day, and nothing
 * connected the two — it read 63s for two days and the drift band happened to absorb it.
 *
 * Re-measure it with `npm run chain -- --all --record`, which refuses any other budget for this reason,
 * refuses a busy machine, and refuses a run where too much moved to have been measuring the code.
 */
export const MEASURED_ON: Machine = { cpu: 'Apple M1 Pro', cores: 10 };

/** A share as vitest writes it in `poolOptions`, which is how a config and this table are compared */
export const asPercent = (share: number): string => `${Math.round(share * 100)}%`;

/** The share a step declares, or undefined where its width is not one — which is what a config can hold */
export const shareOf = (step: string): number | undefined => {
  const width = POOL_WIDTH[step];
  return width !== undefined && width !== UNCAPPED && 'share' in width ? width.share : undefined;
};
