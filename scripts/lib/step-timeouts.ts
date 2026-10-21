// How long a step may run before its process group is killed, by the kind of work it is.
//
// **A deadline is a declared class, never a multiple of a measurement.** A class carries no machine: it
// states the kind of work and is chosen for the slowest plausible box, so a smaller machine runs the same
// deadlines without a flake that reads as a code failure. A wedge found at ten minutes rather than at 84
// seconds is the same wedge found.
//
// **Declared by kind, and never derived by thresholding a cost.** That re-couples the killer to a
// measurement. `sizeOf` (`scripts/lib/test-timeouts.ts`) is the same rule for tests: it reads the config
// filename, the half and suite membership — never a duration — and refuses a file it cannot classify.

/**
 * Which common rung a step's *kind of work* puts it on, as something a check can run:
 *
 * - `quick` — one compiler, one linter, one codegen pass.
 * - `suite` — a test suite or a bundle: it fans out across workers or processes. A step that *builds* is a
 *   bundle and not one compiler.
 * - `scenario` — runs an install: `npm install`, a packed tarball, mostly serial and mostly waiting.
 * - `acceptance` — the complete compiler/runtime integration pool, with repeated cold builds, watchers,
 *   archive verification and lifecycle combinations across all its projects.
 *
 * The facts come in rather than being read here, so this module stays underneath `chain-steps.ts`.
 * `chain-graph.spec.ts` gathers them — `installs` from a scan of the step's script text, `fansOut` from
 * whether it declares a `POOL_WIDTH` entry (never what `coresFor` returns, which varies with the machine),
 * `builds` from whether it declares `outputs` — and holds the reviewed exceptions.
 *
 * It is a check and not the declaration: `ChainStep.timeout` stays written down, because deriving a kill
 * deadline from what a step costs would let a cost change silently move when it is killed.
 */
export const rungForKind = (work: { installs: boolean; fansOut: boolean; builds: boolean }): TimeoutClass =>
  work.installs ? 'scenario' : (work.fansOut || work.builds) ? 'suite' : 'quick';

/** Each class's deadline, in milliseconds — what `boundedSpawn` is given */
export const TIMEOUT_MS = {
  quick: { ms: 60_000 },
  suite: { ms: 600_000 },
  scenario: { ms: 900_000 },
  acceptance: { ms: 7_200_000 },
} as const satisfies Record<string, { readonly ms: number }>;

export type TimeoutClass = keyof typeof TIMEOUT_MS;

/** Every class, for a check that wants to know none is unused */
export const TIMEOUT_CLASSES = Object.keys(TIMEOUT_MS) as readonly TimeoutClass[];

/**
 * A class named as a string — from a command line, where no type checked it.
 *
 * Refused rather than defaulted, for `sizeOf`'s reason: a budget is a ceiling, so a confident wrong answer
 * is the permissive one. The typed path (`TIMEOUT_MS[step.timeout].ms`) needs none of this.
 */
export function timeoutMsFor(className: string): number {
  const rung = (TIMEOUT_MS as Readonly<Record<string, { readonly ms: number } | undefined>>)[className];
  if (rung === undefined) {
    throw new Error(`No such timeout class: ${className} — one of ${TIMEOUT_CLASSES.join(', ')}`);
  }
  return rung.ms;
}

/** A class as a span, for a message that names what was spent rather than a number nobody chose */
export const timeoutText = (className: TimeoutClass): string =>
  `${TIMEOUT_MS[className].ms / 1000}s (${className})`;

/**
 * Report the enforced bound and the step's recorded cost here, without diagnosing the cause from elapsed time.
 * `seconds` is the median from `step-durations.ts`, absent where this machine has no reading.
 */
export function timedOutBecause({ what, timeout, seconds }: { what: string; timeout: TimeoutClass; seconds?: number }): string {
  const recorded = seconds !== undefined && seconds > 0
    ? ` It usually takes ${seconds}s here.`
    : ' This machine has no recorded cost for it.';
  return `${what} timed out: it exceeded its ${timeoutText(timeout)} budget and its process group was killed.`
    + recorded + ' A timeout alone does not distinguish slow progress from stalled work. Inspect the run output before retrying or changing its budget.';
}
