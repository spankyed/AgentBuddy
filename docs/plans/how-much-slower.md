# How much slower: one number for three questions

**Status: done.** Landed on `AS/how-much-slower`. This records the problem and what was decided, including
the phase that was planned and deliberately not built.

## Problem

`SLOWER_MACHINE = 4` (`scripts/lib/core-budget.ts`) is how much slower this repo assumes a smaller machine
is, and `MAX_DECLARED_SHARE = 1 / SLOWER_MACHINE` was what `chain-graph.spec.ts` held the timeout ladder to:
a step could declare up to a quarter of its class, because at a quarter it lands exactly on its deadline four
times slower.

**One number was serving three different questions**, and they do not have the same answer:

| what gets slower | measured? | which rung it describes |
|---|---|---|
| fewer workers — a pool on a smaller box | **yes**, 9 → ~2 workers is 3-4× (`docs/archive/plans/costs-across-machines.md:71`) | `suite` |
| less CPU time per process — a busy or small box | no | `quick` |
| slower cores — different silicon | no | all of them |

The consequences were concrete:

- **The bound could not have a margin.** At a quarter a step is permitted to reach its deadline *exactly* on
  the machine the ladder is sized for, which is the boundary of a flake rather than a distance from one.
- **The asymmetry was prose.** `step-timeouts.ts` recorded that `suite` holds the members that stretch most and
  has the least headroom while `scenario` is "mostly waiting" and has the most — a sentence a reader had to
  trust.
- **Which figure was a guess was invisible.** Nothing at the call site said the 4 had been measured for one of
  the three kinds. It read as a property of machines.

## What landed

**One row per rung, carrying its own factor and the provenance of that factor.** `TIMEOUT_MS`' entries are
`{ ms, stretches, measured, until }`: `suite` cites the pool measurement as its own, `quick` and `scenario`
borrow it and say outright that they are borrowing it. `ASSUMED_RUNGS` derives which those are, so no prose can
name the wrong ones. `MAX_DECLARED_SHARE` is gone; `declaredShare(seconds, class)` is where a cost lands
against its deadline on the machine *that rung* is sized for, and `chain-graph.spec.ts` holds it under 1.

Behaviour is unchanged — every deadline is the same number and the same steps pass the same bound. What
changed is that the bound discriminates. Measured by substituting one factor at a time:

```
quick -> 8      typecheck:fe (10s), typecheck:pack (8s)
suite -> 8      test:unit:host (42s), test:integration (60s), build:app (39s)
scenario -> 8   nothing — 91s of 900s is 81% even at 8x
```

A global factor could not produce any one of those three answers, and the last one is the "headroom runs
opposite to the stretching" paragraph turned into arithmetic.

**One timeout sentence, stating what the kill proves.** `timedOutBecause` replaces five different messages, of
which two said nothing at all (`test-unit.ts` printed `TIMEOUT` in a status column; `test-unit-pool.ts` threw
the two words `timed out`) — both on `suite`, the one rung whose factor is measured. It carries three things
the old messages between them did not:

- **The rope**: the deadline over what the step costs healthy. A kill truncates the measurement — elapsed is
  the deadline plus the grace period by construction — so the rope is the only figure with information in it,
  and nothing in the repo computed it. `driftReport` formats exactly that ratio one function away, on the
  ordinary-failure path.
- **An interpretation gated on the machine.** "So it is wedged" is true where the costs were measured and an
  assertion the program cannot make anywhere else. Off that machine it names the rung, its factor and whether
  anyone measured it, and says the rope is the finding — rather than pre-empting it with *"overrunning one is
  not a stale number"*, which is the sentence that would stop a reader suspecting the row.
- **A refusal.** `scripts/bounded.ts` has a class and an argv and no step record, and a partial pool run has no
  cost that describes it; both take the arm that says nothing records what it costs rather than computing a
  rope from the wrong operand.

Three defects fixed in passing: `typecheck.ts` hardcoded `timeoutText('quick')` while the kill read
`TIMEOUT_MS[LEG_TIMEOUT]`, so changing the legs' class would have had the message name a deadline other than
the one that fired; and the two pool reporters above.

**The condition, per rung.** `until` says what would end an assumption, and the answers differ: `quick` is
exercised by `npm run typecheck` on a smaller machine, which CI does; `scenario` is reached only through
`npm run chain`, which CI does not run, so nothing exercises it. `ci.yml`'s header now records that enabling
it validates one of the two assumed rows and none of the eleven pool, build and scenario steps.

## The phase that was cut, and why

The plan had a middle phase: measure `quick` and `scenario` with
`npm run measure -- --busy N` and `--maxWorkers`, then tighten the bound.

**`--busy` induces contention on a ten-core box, which is not a slower core.** A single `tsc` with eight
burners beside it still gets most of a core, where on a four-core box it would compete differently. The figure
answers a different question from the one the bound asks — and a number that reads as measured while answering
something else is the defect this whole branch was removing. The original plan filed that under "Unverified"
and planned around it anyway.

**A marked assumption is better than a proxy, because a proxy stops looking like one.** That is why `measured`
is a field rather than a comment, and why `ASSUMED_RUNGS` is derived.

Tightening the bound is cut for the same reason: a margin on top of today's figures fails five steps, three of
them single compilers the pool measurement does not describe. It needs factors that are real, and `until` says
where those come from.

## Revisit when

A rung's `until` is satisfied — for `quick`, the day CI's triggers go back on. Replace that row's borrow with
its own number and move the sentence from `until` to `measured`; `chain-graph.spec.ts` holds every rung to
having exactly one of the two, so the edit cannot be half done.
