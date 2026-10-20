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
// is the whole of what portability needs here: a wedge found at ten minutes rather than at 84 seconds is
// the same wedge found.
//
// **Declared by kind, and never derived by thresholding a cost.** That shortcut re-couples the killer to the
// record, just coarsely, and the first slow machine is back where it started. `sizeOf`
// (`scripts/lib/test-timeouts.ts`) is the precedent in both halves: it reads the config filename, the half
// and suite membership — never a duration — and *refuses* a file it cannot classify rather than defaulting,
// "because the budget is a ceiling, so the confident wrong answer is the permissive one".

import { machineText, SLOWER_MACHINE, thisMachine, type Machine } from './core-budget.ts';

/** What a rung is: a deadline, how much its kind of work stretches on a smaller box, and who measured that */
export interface Rung {
  /** The deadline, in milliseconds. What `boundedSpawn` is given */
  readonly ms: number;
  /**
   * How much longer this rung's work takes when the machine gives it a fraction of what this one does — in
   * whatever unit that kind of work is sensitive to. A pool is sensitive to its worker count, serial work to
   * CPU share. One question, two units, which is why a single global figure could not hold it.
   *
   * **A small integer, which is its own band.** `POOL_WIDTH`'s doc records why that matters: *"an integer
   * core count is its own band — 1.6 and 2.2 both round to two, so the jitter that hysteresis exists to
   * absorb cannot move either one."* So this needs none of `spec-cost.json`'s machinery — no hysteresis, no
   * busy-machine refusal, no `:check`/`:update` pair — and is a declaration rather than a second sample to
   * keep current.
   */
  readonly stretches: number;
  /**
   * What measured `stretches`, or `undefined` where the figure is an assumption standing in.
   *
   * The field exists so that *which of these is a guess* is legible at the call site rather than in prose,
   * and so the population of assumed rungs can be derived (`ASSUMED_RUNGS`) instead of listed somewhere that
   * can go stale. An assumed rung borrows `SLOWER_MACHINE` outright, so it moves if that measurement does;
   * measuring one means replacing the borrow with its own number and saying so here.
   */
  readonly measured: string | undefined;
  /**
   * What would end the assumption — present only while `measured` is `undefined`.
   *
   * Per rung rather than in one paragraph, because the answer differs by rung.
   *
   * **It names a run that reaches this rung and never claims nothing else does.** That form is the one thing
   * here that went wrong: `scenario` said it was "reached only through `npm run chain`, which CI does not run",
   * which was derived from the chain being the only *step* table and missed the second path in —
   * `scripts/bounded.ts`, which four npm scripts invoke with a class, two of them in CI's own
   * `external-pack-e2e` job. So the row recorded as unobservable was the one a scheduled run bounds twice. An
   * exclusivity claim about reachability cannot be checked from here; which rungs that second path bounds at
   * can be, and `chain-graph.spec.ts` derives it from `package.json`.
   *
   * **Exactly one of this and `measured` is set**, which `chain-graph.spec.ts` holds: a measured rung with a
   * condition still on it is a stale one, and an assumed rung without one is a guess nobody wrote down the
   * terms of. Both are declared rather than optional, so neither is a key a caller cannot read.
   *
   * This is documentation for collecting a complete measurement, not an instruction inferred from a
   * killed run. A timeout provides neither a completed duration nor evidence of a stall.
   */
  readonly until: string | undefined;
}

/**
 * Declared classes distinguish the work a process owns; individual test/operation limits are separate.
 *
 * - `quick` — one compiler, one linter, one codegen pass. Most of the table, and all of it already sat on
 *   the old 60s floor, so this rung changes nothing for those steps.
 * - `suite` — a test suite or a bundle: it fans out across workers or processes, which makes it the rung
 *   that stretches most on a smaller box. A step that *builds* is a bundle and not one compiler.
 * - `scenario` — runs an install: `npm install`, a packed tarball, mostly serial and mostly waiting.
 * - `acceptance` — the complete compiler/runtime integration pool, with repeated cold builds,
 *   watchers, archive verification and lifecycle combinations across all its projects.
 *
 * `rungForKind` classifies common work; reviewed exceptions live in `chain-graph.spec.ts`.
 * Each class declares its own scaling factor. The ordinary suite factor is measured; the others
 * explicitly record their conservative assumption and the evidence needed to replace it.
 *
 * Ordinary suites/bundles retain 600s and install scenarios retain 900s. Complete acceptance has its
 * own aggregate allowance; the pool runner and its chain parent use the same declaration.
 */
/**
 * Which common rung a step's *kind of work* puts it on — the criteria above, as something a
 * check can run rather than prose a reader has to apply.
 *
 * **The facts come in rather than being read here**, which is the same reason `timedOutBecause` takes
 * `MEASURED_ON` as a parameter: this module stays underneath `chain-steps.ts` and `core-budget.ts` rather
 * than importing either. `chain-graph.spec.ts` gathers them — `installs` from a scan of the step's script
 * text, `fansOut` from whether it declares a `POOL_WIDTH` entry, `builds` from whether it declares
 * `outputs`.
 *
 * **`fansOut` asks whether a width is declared, never what `coresFor` returns.** That resolves against the
 * running machine, so on a one-core box every width-declaring step reads as one core and this answer would
 * change with the hardware.
 *
 * It is a check and not the declaration: `ChainStep.timeout` stays written down, because a rung is a kill
 * deadline and deriving it from `POOL_WIDTH` would let a change to what a step *costs* silently move when it
 * is *killed*. Reviewed exceptions in `chain-graph.spec.ts` state where those common facts are insufficient.
 */
export const rungForKind = (work: { installs: boolean; fansOut: boolean; builds: boolean }): TimeoutClass =>
  work.installs ? 'scenario' : (work.fansOut || work.builds) ? 'suite' : 'quick';

export const TIMEOUT_MS = {
  quick: {
    ms: 60_000,
    stretches: SLOWER_MACHINE,
    measured: undefined,
    until: '`npm run typecheck` on a smaller machine: every one of its legs is bounded here, and CI runs it, '
      + 'so enabling `.github/workflows/ci.yml`\'s commented-out triggers measures this row',
  },
  suite: {
    ms: 600_000,
    stretches: SLOWER_MACHINE,
    // **One member measured, every member charged.** The figure is end-to-end on `test:unit:host`, whose
    // pool takes the whole box. A member that caps its own width loses fewer workers and so stretches less:
    // worker loss on this box alone puts `test:integration` at 1.94x going five workers to two (42.5s ->
    // 82.5s, median of 3, 2026-10-04), against the 4 the rung charges it. That is the coarseness a declared
    // class is for, and it runs in the safe direction — a ceiling set too high costs only a wedge found
    // later, which the file header weighs, where one set too low kills a step that was passing. So a capped
    // member's `declaredShare` is pessimistic rather than a fact about that member, and the number that
    // would settle one that fails the bound is that member on a hosted runner, not a second factor here.
    //
    // **A member that has measured its own loss declares it** (`ChainStep.stretches`), and that is not the
    // second factor this paragraph refuses: the *deadline* stays the class's, so nothing re-couples the
    // killer to a measurement. What the member's figure corrects is `declaredShare`, which is a bound and a
    // report — and pessimism that is safe in a ceiling is noise in a report. Charging `test:integration` 4x
    // put its *measured* cost at 1.03 of the rung on every run, which is a true sentence about a factor it
    // does not have.
    //
    // The subject only. The figure is `stretches` beside it and the citation is in this table's doc, so a
    // message that quotes this does not say the number twice and does not carry a doc path to a terminal
    measured: 'a vitest pool dropping from nine workers to about two on a hosted runner',
    until: undefined,
  },
  scenario: {
    ms: 900_000,
    stretches: SLOWER_MACHINE,
    measured: undefined,
    until: '`npm run test:external-pack` or `npm run test:packaged-authoring` on a smaller machine — each '
      + 'bounded here through `scripts/bounded.ts`, so a direct run at a terminal reaches this rung, and so '
      + 'does CI\'s `external-pack-e2e` job, which runs both',
  },
  acceptance: {
    ms: 7_200_000,
    stretches: SLOWER_MACHINE,
    measured: undefined,
    until: 'measure complete compiler/runtime acceptance at different worker counts; its existing '
      + 'operation, event and cleanup deadlines remain independent of this aggregate allowance',
  },
} as const satisfies Record<string, Rung>;

export type TimeoutClass = keyof typeof TIMEOUT_MS;

/** Every class, for a check that wants to know none is unused */
export const TIMEOUT_CLASSES = Object.keys(TIMEOUT_MS) as readonly TimeoutClass[];

/**
 * The rungs whose `stretches` nobody has measured — derived, and what the prose about them is held to.
 *
 * **"Derived, so prose cannot name the wrong ones" was half the job and it read as the whole of it.** The
 * derivation makes this list right; nothing made the prose match it, and six places restate which rungs are
 * assumed. One of them went stale within a day — `ci.yml`'s header named the wrong count of what enabling
 * CI would settle, which `5300582c3` had to correct in eight paths and missed in a seventh. So
 * `chain-table.spec.ts` now holds that header to this list, which is the one restatement outside source and
 * the one a person reads before switching CI on.
 *
 * No count here, deliberately: a hand-written "two of three" directly above a derivation meant to replace
 * hand-written counts was the same defect in miniature. The honest resting state for each is its own
 * `until`.
 */
export const ASSUMED_RUNGS: readonly TimeoutClass[] =
  TIMEOUT_CLASSES.filter((className) => TIMEOUT_MS[className].measured === undefined);

/**
 * Where a declared cost lands against its deadline on the smaller machine its rung is sized for. 1 is exactly
 * on it.
 *
 * `chain-graph.spec.ts` holds the table to this being under 1. It is a **bound** on a declared cost, never a
 * way of choosing a class from one — the file header has why that distinction is the whole game — and it is
 * derived rather than picked: a step at `1 / stretches` of its class here lands exactly on its deadline there,
 * so that is the loosest useful bound and anything past it has a deadline that has stopped being a ceiling.
 */
export const declaredShare = (seconds: number, className: TimeoutClass, stretches?: number): number =>
  (seconds * 1000 * (stretches ?? TIMEOUT_MS[className].stretches)) / TIMEOUT_MS[className].ms;

/**
 * A class named as a string — from a command line, where no type checked it.
 *
 * Refused rather than defaulted, for `sizeOf`'s reason: a budget is a ceiling, so a confident wrong answer
 * is the permissive one. The typed path (`TIMEOUT_MS[step.timeout].ms`) needs none of this.
 */
export function timeoutMsFor(className: string): number {
  const rung = (TIMEOUT_MS as Readonly<Record<string, Rung | undefined>>)[className];
  if (rung === undefined) {
    throw new Error(`No such timeout class: ${className} — one of ${TIMEOUT_CLASSES.join(', ')}`);
  }
  return rung.ms;
}

/** A class as a span, for a message that names what was spent rather than a number nobody chose */
export const timeoutText = (className: TimeoutClass): string =>
  `${TIMEOUT_MS[className].ms / 1000}s (${className})`;

/** Report the enforced bound and recorded context without diagnosing the cause from elapsed time. */
export function timedOutBecause({ what, timeout, measuredOn, machine, seconds }: {
  what: string;
  timeout: TimeoutClass;
  measuredOn: Machine;
  machine?: Machine;
  seconds?: number;
}): string {
  const recorded = seconds !== undefined && seconds > 0
    ? ` Recorded cost: ${seconds}s on ${machineText(measuredOn)}; this run: ${machineText(machine ?? thisMachine())}.`
    : ' This run carries no recorded cost.';
  return `${what} timed out: it exceeded its ${timeoutText(timeout)} budget and its process group was killed.`
    + recorded + ' A timeout alone does not distinguish slow progress from stalled work. Inspect the run output before retrying or changing its budget.';
}
