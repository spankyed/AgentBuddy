// How long a step may run before its process group is killed, by the kind of work it is.
//
// **A deadline is a declared class, never a multiple of a measurement.** It was
// `budgetFor(seconds) = max(60s, 4 × seconds)` until 2026-10-03, which made every kill deadline in the repo
// a function of one developer's ten-core box: a machine with a third of the cores runs the same deadlines
// over steps three to four times slower, and the four-times margin is all that absorbs it. Measured,
// `test:unit:host` sat at 42s declared against a 168s deadline with nine workers here and about two on a
// hosted runner — 130-170s against 168s, which is a flake that reads as a code failure.
//
// A class carries no machine. It states the kind of work and is chosen for the slowest plausible box, which
// is the whole of what portability needs here: a wedge found at five minutes rather than at 84 seconds is
// the same wedge found.
//
// **Declared by kind, and never derived by thresholding a cost.** That shortcut re-couples the killer to the
// record, just coarsely, and the first slow machine is back where it started. `sizeOf`
// (`scripts/lib/test-timeouts.ts`) is the precedent in both halves: it reads the config filename, the half
// and suite membership — never a duration — and *refuses* a file it cannot classify rather than defaulting,
// "because the budget is a ceiling, so the confident wrong answer is the permissive one".

/**
 * The ladder. Three rungs, and each names a kind of work rather than a span of measurements.
 *
 * **Three, against `SIZE_MS`' argument for two.** That constant says "two buckets, because two is what has
 * consumers", and it is right to refuse a rung that only exists to sit between others. Three survive it
 * because three kinds are nameable, and what distinguishes them is not how long they take but what they
 * start:
 *
 * - `quick` — one compiler, one linter, one codegen pass. Eighteen of the chain's twenty-nine steps, and all
 *   of them already sat on the old 60s floor, so this rung changes nothing for most of the table.
 * - `suite` — a test suite or a bundle: the three unit pools, `build:app`, the smoke and E2E suites, and the
 *   two that build things rather than check one thing (`packages:ensure`, `compile`). These fan out across
 *   workers or processes, so they are the rung that stretches most on a smaller box.
 * - `scenario` — starts an app or runs an install: the external-pack pair and `test:packaged-authoring`.
 *   `npm install`, Electron and a packed tarball, mostly serial and mostly waiting.
 *
 * **What each rung actually tolerates, so the next reader checks it instead of re-deriving it.** Against its
 * own worst declared member, and then that member on the `SLOWER_MACHINE` the ladder is sized for:
 *
 * ```
 * quick     18 steps   worst typecheck:fe           10s   17% of 60s    67% four times slower
 * suite      9 steps   worst test:integration       60s   20% of 300s   80%
 * scenario   2 steps   worst test:packaged-authoring 91s  10% of 900s   40%
 * ```
 *
 * `test:integration` is the tightest step in the table and the one to watch: it is a pool, so the 4× figure
 * is a measurement of exactly its failure mode rather than an upper bound borrowed from one. 80% is not a
 * flake, and it is not comfortable either.
 *
 * **The headroom runs opposite to the stretching, which is worth knowing before changing a value.** `suite`
 * holds the members that scale worst and has the least room; `scenario` is "mostly waiting" and has the
 * most. That is an artefact of taking Bazel's ladder whole rather than a conclusion anyone reached, and the
 * reason it is left alone is that nothing is out of range — `MAX_DECLARED_SHARE` is what notices if that
 * changes. Two steps were out of range until 2026-10-03: `packages:ensure` and `compile` sat at 93% and 87%
 * four times slower while declared `quick`, because a step that *builds* is a bundle and not one compiler.
 *
 * The values are Bazel's own ladder minus its `short`, which nothing here wants: its `moderate` is 300s and
 * its `long` 900s. A rung whose membership would be "whatever is left over" is the rung not to add.
 */
export const TIMEOUT_MS = {
  quick: 60_000,
  suite: 300_000,
  scenario: 900_000,
} as const;

/**
 * How much slower the ladder assumes a smaller machine is.
 *
 * Measured rather than chosen: a vitest pool dropping from nine workers to about two on a hosted runner is
 * three to four times slower, which is the figure every rung above was sized against
 * (`docs/archive/plans/costs-across-machines.md`). The serial steps stretch less than that and the single
 * compilers less again, so four is the worst case and not the typical one.
 */
export const SLOWER_MACHINE = 4;

/**
 * The largest share of its class a step may declare here, which is the reciprocal of the above and not a
 * separate judgement: a step at this share lands exactly on its deadline four times slower, so anything past
 * it has a deadline that has stopped being a ceiling.
 *
 * `chain-graph.spec.ts` holds the table to it. It is a **bound** on a declared cost, never a way of choosing
 * a class from one — the file header has why that distinction is the whole game.
 */
export const MAX_DECLARED_SHARE = 1 / SLOWER_MACHINE;

export type TimeoutClass = keyof typeof TIMEOUT_MS;

/** Every class, for a check that wants to know none is unused */
export const TIMEOUT_CLASSES = Object.keys(TIMEOUT_MS) as readonly TimeoutClass[];

/**
 * A class named as a string — from a command line, where no type checked it.
 *
 * Refused rather than defaulted, for `sizeOf`'s reason: a budget is a ceiling, so a confident wrong answer
 * is the permissive one. The typed path (`TIMEOUT_MS[step.timeout]`) needs none of this.
 */
export function timeoutMsFor(className: string): number {
  const ms = (TIMEOUT_MS as Readonly<Record<string, number>>)[className];
  if (ms === undefined) {
    throw new Error(`No such timeout class: ${className} — one of ${TIMEOUT_CLASSES.join(', ')}`);
  }
  return ms;
}

/** A class as a span, for a message that names what was spent rather than a number nobody chose */
export const timeoutText = (className: TimeoutClass): string =>
  `${TIMEOUT_MS[className] / 1000}s (${className})`;
