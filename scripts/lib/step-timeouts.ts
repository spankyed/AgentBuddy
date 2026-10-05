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

import { isMeasuredMachine, machineText, SLOWER_MACHINE, thisMachine, type Machine } from './core-budget.ts';

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
   * **Read by no code, and it must stay that way: never put this in a kill message.** This names a run that
   * reaches the rung, and the arm that would print it runs only off the measured machine — so its reader is
   * always on a box that can supply the evidence, and the message exists because a run just reached that rung.
   * It therefore always names the run the reader has just made, whatever the wording, and `rungTerms` says
   * "this run is the evidence" instead. No wording escapes that, so the rule is the field's absence rather than
   * its phrasing.
   *
   * **No *runtime* path reads it**, which is the rule above; one spec does, in two places.
   * `chain-graph.spec.ts` destructures it for the exactly-one-of invariant — this field's verifier, and the
   * check `rungTerms` sends a reader to when it says to move `until` to `measured` — and the same file
   * asserts that the message does *not* quote it, which is what keeps the rule above from being undone
   * quietly. Beside it, `chain-table.spec.ts` holds `ci.yml`'s header to `ASSUMED_RUNGS`: the field's
   * *subject* rather than its text, and the check that catches the staleness this kind of prose is prone to.
   */
  readonly until: string | undefined;
}

/**
 * The ladder. Three rungs, and each names a kind of work rather than a span of measurements.
 *
 * **Three, against `SIZE_MS`' argument for two.** That constant says "two buckets, because two is what has
 * consumers", and it is right to refuse a rung that only exists to sit between others. Three survive it
 * because three kinds are nameable, and what distinguishes them is not how long they take but what they
 * start:
 *
 * - `quick` — one compiler, one linter, one codegen pass. Most of the table, and all of it already sat on
 *   the old 60s floor, so this rung changes nothing for those steps.
 * - `suite` — a test suite or a bundle: it fans out across workers or processes, which makes it the rung
 *   that stretches most on a smaller box. A step that *builds* is a bundle and not one compiler.
 * - `scenario` — runs an install: `npm install`, a packed tarball, mostly serial and mostly waiting.
 *
 * **Which steps are on which rung is `rungForKind`'s answer and not a list here.** It used to be a list, and
 * all three rows had drifted from the table by 2026-10-05: `quick` claimed eighteen of twenty-nine where it
 * was seventeen, `suite` named eight of its ten, and `scenario` said "the external-pack pair" when only
 * `:app` is on it. A membership anyone can derive is one nobody should copy.
 *
 * **One `stretches` per rung, because one number was answering three questions.** The 4× is a measurement of
 * a *pool* losing workers, which is `suite` and nothing else; `quick` is single compilers losing CPU share
 * and `scenario` is mostly waiting on a disk and a network. Those two borrow the pool figure and say so, and
 * `declaredShare` reads each rung's own, so the asymmetry below is arithmetic rather than a sentence a reader
 * has to trust.
 *
 * **The headroom runs opposite to the stretching, which is worth knowing before changing a value.** `suite`
 * holds the members that scale worst and has the least room; `scenario` is "mostly waiting" and has the most.
 * That is an artefact of taking Bazel's ladder whole rather than a conclusion anyone reached, and the reason
 * it is left alone is that nothing is out of range — `declaredShare` is what notices if that changes. Two
 * steps were out of range until 2026-10-03: `packages:ensure` and `compile` sat at 93% and 87% four times
 * slower while declared `quick`, because a step that *builds* is a bundle and not one compiler.
 *
 * The values are Bazel's own ladder minus its `short`, which nothing here wants: its `moderate` is 300s and
 * its `long` 900s. A rung whose membership would be "whatever is left over" is the rung not to add.
 */
/**
 * Which rung a step's *kind of work* puts it on — the criterion the three rows above state, as something a
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
 * is *killed*. Those are two facts, and the redundancy is cheaper than the coupling. One step disagrees on
 * purpose, and `chain-graph.spec.ts` carries it with its reason.
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
    ms: 300_000,
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
export const declaredShare = (seconds: number, className: TimeoutClass): number =>
  (seconds * 1000 * TIMEOUT_MS[className].stretches) / TIMEOUT_MS[className].ms;

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

/**
 * A ratio as a reader can use it: a decimal only where it carries something.
 *
 * `4.0x` for a declared integer reads as a measurement taken to one place, and past ten a tenth is noise
 * either way — `loop-blocks.spec.ts` has the same rule from the other end, that a factor quoted where it
 * cannot mean anything makes a reader discount the rest of the report.
 */
const factorText = (factor: number): string =>
  factor >= 10 || Number.isInteger(factor) ? `${Math.round(factor)}x` : `${factor.toFixed(1)}x`;

/**
 * What a rung's stretch factor rests on, and — where it rests on a borrow — what to do with this run.
 *
 * **It must not quote `until`, which would be circular by construction.** The field names a run that reaches
 * the rung; this arm prints only off the measured machine, so its reader is always on a box that can supply the
 * evidence, and the message exists *because* a run just reached that rung. The rung being reported is always
 * the rung whose bound just fired, so quoting `until` says "to find out, do what you just did". No argument to
 * `timedOutBecause` makes it otherwise — see that field's own doc.
 *
 * So what an assumed rung says instead is the one thing that *is* true at a kill: this run is the evidence,
 * and here is the edit that records it — the same edit `chain-graph.spec.ts` polices as exactly one of
 * `measured` and `until`.
 */
const rungTerms = (rung: Rung, className: TimeoutClass): string => (rung.measured === undefined
  ? `which its row assumes is ${factorText(rung.stretches)} and has never measured, so this run is the `
    + `evidence it waits for: put the number on ${className}'s \`stretches\` and move its \`until\` to `
    + '`measured`.'
  : `where its row records ${factorText(rung.stretches)}, measured on ${rung.measured}. That number is the `
    + 'finding.');

/**
 * What a step says when its class killed it, and what that kill actually proves.
 *
 * **A kill truncates the measurement, so the only honest figure is a lower bound.** The step did not finish,
 * and the time it ran is the deadline plus the grace period by construction (`bounded-spawn.ts`), so elapsed
 * carries nothing. What the run proves is the *rope* the class gave it — the deadline over what it costs
 * healthy — and that is a number no other report in the repo computes: `driftReport` and `howLong`
 * (`chain-output.ts`) both put a declared cost beside a measured one, and both are on the ordinary-failure
 * path.
 *
 * **The interpretation is machine-dependent, and every arm of it is gated.** On the machine the costs were
 * measured on, rope this large means wedged. Anywhere else a step can exceed its deadline by being slow, and
 * *that is the evidence the assumed rungs are waiting for* — so the message names the rung's factor and says
 * the number is the finding, rather than pre-empting it with "not a stale number".
 *
 * **The machine is a separate argument from the cost, and bundling them breaks the arm that needs it most.**
 * "Neither means anything without the other" is true of the *rope* and false of the *verdict*: a cost is a
 * property of the step and can legitimately be absent, where the machine is a property of the process and never
 * is. In one optional bundle the arm with no cost has no machine either, so it cannot be gated and hands down a
 * verdict on any box — in the arm four of the five call sites can reach. Machine always, cost optional, and all
 * three arms gate.
 *
 * The rope and `stretches` are the same arithmetic from opposite ends: `declaredShare` keeps every step's
 * rope above its rung's factor, so a step that outran its rope has broken that bound in production.
 */
export function timedOutBecause({ what, timeout, measuredOn, machine, seconds }: {
  /** The step, leg or command line that was killed */
  what: string;
  timeout: TimeoutClass;
  /**
   * The machine the ladder's costs were taken on, which is what decides whether a verdict is available.
   *
   * Passed rather than imported (`MEASURED_ON`, `chain-steps.ts`), which is what keeps this module under the
   * ladder and testable about a machine it is not running on — the same reason `driftReport` takes one.
   */
  measuredOn: Machine;
  /** The box this is running on; `thisMachine()` where a caller has no reason to say */
  machine?: Machine;
  /**
   * What the thing costs healthy, where anything records it. Absent for `scripts/bounded.ts`, which has a
   * class and an argv and no step record, and for a step or pool whose row carries no `seconds` — so the
   * rope is not a number those paths can compute, and the message says so instead of inventing one.
   */
  seconds?: number;
}): string {
  const killed = `${what} timed out: it exceeded its ${timeoutText(timeout)} budget and its process group `
    + 'was killed.';
  const rung = TIMEOUT_MS[timeout];
  const here = isMeasuredMachine(measuredOn, machine);
  if (seconds === undefined || seconds <= 0) {
    // "This run" and not "nothing": the scripts `scripts/bounded.ts` bounds are mostly chain steps, and
    // every chain step declares a cost (`chain-graph.spec.ts`), so what a direct run of one lacks is a step
    // record rather than a measurement. Claiming a global absence sent a reader looking for a number that is
    // in `chain-steps.ts`. No figures here: they are that table's, which `--record` rewrites.
    const unknown = `${killed} This run carries no recorded cost, so how much rope that was is unknown`;
    // The same split as the two arms below, for the same reason: a class is sized so that a declared cost
    // fits inside it on a box `stretches` times slower, so overrunning it *here* means more than that whole
    // budget and wedged is the only reading left. Off this machine the step may simply be slow, and on an
    // assumed rung how slow is the open question — so there is nothing to conclude and the rung's own terms
    // are what to report.
    //
    // **The verdict names its premise rather than asserting itself**, because the premise is what scopes it:
    // `declaredShare` holds every *declared* cost under its rung, which covers the chain steps reaching here
    // through `scripts/bounded.ts` and not a run with no declared cost anywhere — `test:external-pack`, which
    // is no chain step, or one pack workspace of a pool, which `POOL_SECONDS` describes only in total. Stated
    // bare, the sentence denied a cost in one clause and reasoned from one in the next.
    //
    // **Off this machine it quotes no factor and asks for no edit**, which took a correction. It said
    // "stretches by more than ${stretches}x — so this run is the evidence it waits for: put the number on
    // this rung's `stretches`", and the only number in that sentence was the rung's own assumption. The
    // other arms get that figure from the rope; with no cost there is no rope, so substituting `stretches`
    // made the claim circular — it exceeded 4x, where 4x is what it declares — and the instruction then
    // invited a reader to record 4 as *measured* and flip `until`, on a run that computed nothing.
    // `chain-graph`'s exactly-one-of invariant accepts that edit, so what it would delete is the only
    // marker saying the factor is a guess. The edit belongs in `rungTerms`, which keeps its one caller
    // below, where a rope exists to be the number.
    return here
      ? `${unknown} — but a class is sized so that every step the chain declares fits inside it on a machine `
        + `${factorText(rung.stretches)} slower than this one, so overrunning it here is wedged rather than `
        + 'slow.'
      : `${unknown}, and this is ${machineText(machine ?? thisMachine())} rather than `
        + `${machineText(measuredOn)}. So it is wedged, or ${timeout} work stretches more here than its row `
        + 'assumes — and with nothing recording what this run costs, neither this message nor the run says '
        + 'which.';
  }
  const rope = factorText(rung.ms / (seconds * 1000));
  if (here) {
    return `${killed} That is ${rope} the ${seconds}s it costs healthy here, so it is wedged rather than `
      + 'slow — a class is chosen for the slowest plausible machine rather than from that cost, so '
      + 'overrunning one is not a stale number.';
  }
  return `${killed} That is ${rope} the ${seconds}s it costs healthy on ${machineText(measuredOn)}, and this `
    + `is ${machineText(machine ?? thisMachine())}. So either it is wedged, or ${timeout} stretches by more `
    + `than ${rope} here — ${rungTerms(rung, timeout)}`;
}
