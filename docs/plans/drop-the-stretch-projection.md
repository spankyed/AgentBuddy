# Drop the stretch projection: keep the deadline, delete the prediction

**Status:** proposed, not started
**Prompted by:** 2026-10-07, a session spent on one false advisory

## What this is about

`scripts/lib/step-timeouts.ts` does two jobs, and only the first is load-bearing.

1. **Kill a wedged step.** Three declared classes — `quick` 60s, `suite` 300s, `scenario` 900s — chosen for
   the slowest plausible machine, membership derived by `rungForKind`. This works, is simple, and the file's
   header makes the case for it well: a deadline is a declared class, never a multiple of a measurement.

2. **Predict whether a step would be killed on a machine nobody has.** This is `stretches`, `declaredShare`,
   `ASSUMED_RUNGS`, `outgrownRungs`, `outgrownReport`, `chain-graph.spec.ts`' bound, the per-step `stretches`
   override, and the `stretches` arm of `timedOutBecause`. Five concepts, a few hundred lines.

The proposal is to delete the second job.

## Why

**The machine it predicts for does not exist.** `.github/workflows/ci.yml` has its `push` and
`pull_request` triggers commented out, so the 4x-slower runner `suite`'s `stretches` cites is hypothetical.
Two of the three rungs say outright that their factor is unmeasured (`ASSUMED_RUNGS`, and each row's `until`
names the run that would settle it — a run on a smaller box, which nothing makes).

**Its output has been one signal, and it was false.** `outgrownRungs` fired on `test:integration` on every
chain run: 101s, 88s, 77s against a 60s declaration, reported as 103-135% of its rung. The step had not
moved. The cause was that `suite`'s `stretches: 4` is measured end to end on `test:unit:host`, whose pool
takes the whole box, while `test:integration` caps itself at half the cores and loses 1.94x — a figure the
file already recorded and described as *"pessimistic rather than a fact about that member"*. Pessimism is
safe in a ceiling and noise in a report, and `declaredShare` is both.

That was patched (per-step `stretches`, `3a7f1c…`'s successor) and the advisory went quiet. The patch is
correct and shippable. But it adds a fourth concept to keep a third one honest, which is the shape of a
mechanism worth removing rather than tuning.

**The cost of not having it is already written down and already accepted.** `step-timeouts.ts`' header
weighs it: *"a wedge found at five minutes rather than at 84 seconds is the same wedge found."* A missing
prediction costs a slower first discovery on a machine that does not run yet. A wrong prediction costs a
session.

## What goes

- `stretches` on `Rung`, and `SLOWER_MACHINE`'s use by it (`scripts/lib/step-timeouts.ts`)
- `declaredShare`, and `ChainStep.stretches` (`scripts/lib/chain-steps.ts`)
- `ASSUMED_RUNGS`, and each rung's `measured` / `until` pair — the exactly-one-of invariant goes with them
- `outgrownRungs` (`scripts/lib/step-timing.ts`) and `outgrownReport` (`scripts/lib/chain-output.ts`), with
  their call site in `scripts/chain.ts`
- the `stretches` arm of `timedOutBecause`, and `rungTerms` — a kill message then says what it was killed
  at and what it costs healthy, with no projection
- `scripts/measure-stretch.ts` and its `measure:stretch` npm script, plus its entry in the root `CLAUDE.md`.
  Its whole output is a number to paste onto a `stretches` field, so it has no subject once that field is
  gone — and it is the wrong instrument for the one factor this plan leaves open, since it fakes a smaller
  box with `--maxWorkers` where that residue asks for a reading from a real runner
- `chain-graph.spec.ts`' `declaredShare < 1` bound, the `ASSUMED_RUNGS` header check in
  `chain-table.spec.ts`, and the `outgrownRungs` entries in `decision-mutations.spec.ts`

Roughly 250 lines of source and 300 of spec.

## What stays

- **The three rungs and `rungForKind`.** The deadline is the whole point and nothing here touches it.
- **`driftedSteps` and `driftReport`.** *Does the declared cost still describe this step*, half to double. No
  projection, so it answers wherever it ran — which is why it keeps its rows anywhere and gates only its
  advice.
- **`--record`'s three conditions** (`RECORDING_CONDITIONS`) and its idle floor. Those are about whether a
  measurement describes the table, not about another machine.
- **`ci.yml`'s `timeout-minutes`**, a round number nobody measured, which is the right shape for CI.

## The question this leaves open, stated so it is not lost

*"Has a step's cost grown enough that its deadline will kill it on CI?"* becomes unanswerable until CI runs.
That is the deliberate trade. When the triggers go back on, the answer arrives as a kill with a real
number — `timedOutBecause` already prints the deadline and the healthy cost, which is the evidence a rung
change needs. If that proves too late, the thing to add back is **one measured factor from a real runner**,
not three declared ones from an estimate.

## Verification

- `npm run typecheck` — the deletions ripple through `chain.ts`, `chain-output.ts`, `step-timing.ts` and
  four spec files; the compiler finds all of them.
- `npx vitest run tests/ --root packages/repo-checks` — expect the total down by the deleted cases, and
  **no other case to move**. One that does is a case that was reading the projection for something else.
- `npm run chain -- --all` — the run must still report `driftReport`'s rows and the critical path, and now
  reports no rung advisory at all. Compare against the baseline in this doc's prompting session: 167.4s,
  zero advisories, critical path 98s.
- **Mutation:** shorten a rung's `ms` and confirm the step is killed and `timedOutBecause` names the new
  deadline. That is the one behaviour this change must not touch.

## What not to do

- **Do not derive a rung from a cost.** `step-timeouts.ts`' header is about exactly this and the reasoning
  survives the deletion intact: a class carries no machine, and thresholding a measurement re-couples the
  killer to the record.
- **Do not keep `declaredShare` "just for the bound".** The bound is the projection. Without a factor there
  is nothing to bound, and `driftedSteps` already watches whether a declaration describes its step.
- **Do not replace it with a per-step deadline.** That is the coupling above, one step at a time.

## The lesson worth keeping from the session that prompted this

Before adding a watcher, check whether an existing one is silent because it is broken rather than because it
is absent — a noisy check and a missing check look identical from the output. And before trusting a factor,
ask whether it is a measurement of *this* step or of a different step's scaling. `suite`'s 4x was the second
kind, and said so in its own comment.
