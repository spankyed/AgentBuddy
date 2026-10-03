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
 * - `quick` — one compiler, one linter, one codegen pass. Twenty of the chain's twenty-nine steps, and all
 *   of them already sat on the old 60s floor, so this rung changes nothing for two thirds of the table.
 * - `suite` — a test suite or a bundle: the three unit pools, `build:app`, the smoke and E2E suites. These
 *   fan out across workers, so they are the rung that stretches most on a smaller box.
 * - `scenario` — starts an app or runs an install: the external-pack pair and `test:packaged-authoring`.
 *   `npm install`, Electron and a packed tarball, mostly serial and mostly waiting.
 *
 * The values are Bazel's own ladder minus its `short`, which nothing here wants: its `moderate` is 300s and
 * its `long` 900s. A rung whose membership would be "whatever is left over" is the rung not to add.
 */
export const TIMEOUT_MS = {
  quick: 60_000,
  suite: 300_000,
  scenario: 900_000,
} as const;

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
