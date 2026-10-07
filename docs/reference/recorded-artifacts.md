# Recorded artifacts: derivations, proxies and samples

Why this is a reference and not a rule: the rule is three sentences and lives in the root `CLAUDE.md`. What
is here is the evidence for it — two subsystems that were built, measured and deleted, and what each cost
while it lived. Read it before adding a recorded artifact, or when you are about to argue that a proxy or a
sample is worth it after all.

The archived goals hold the same ground from the other direction:
[`goal-placement-without-a-clock.md`](../archive/goals/goal-placement-without-a-clock.md) is the attempt that
ended the sample, and [`goal-measured-placement.md`](../archive/goals/goal-measured-placement.md) is the one
that built it.

**Three kinds of recorded artifact, and the question to ask of a new one is which it is.**

A **derivation** re-takes its answer on every run and compares — `schema:check`, `exports:check`,
`facade:check`, `seed-parity:check`. A missing input is not a thing that can happen to one, so a case
perturbing the recorded file would only prove that `!==` works.

**Re-taking the answer means running whatever produces it, and that is the half a derivation loses
quietly.** `facade:check` compared the committed report against `dist/types/pack-types.d.ts` — a file some
earlier `abuddy build` wrote, from whatever the sources were then — so `npm run compile` was right by
ordering alone and the same command run by hand could pass over a bundle an hour old, while `--update` wrote
a committed file off it. What it costs not to do that is one bundle: re-bundling default-setup's facade is
2.4s (median of 3, 86% idle, 2026-10-06) and reproduces the build's output byte for byte, against `api:check`
at 6.9s for the same shape. A check whose subject is a file it did not produce is a derivation in name only.

A **proxy** records a hash of what it *believes* the inputs are. **Nothing here is one any more**, and the
one that was is why: a proxy's key is a list of someone else's inputs, so it can go stale from an input
nobody listed, and its remedy *writes*. `api:stamp` was a proxy for `api:check` purely because that cost
55s; at 6.9s the derivation is the cheaper thing to keep. Before reaching for one, price the derivation
again — the paragraph above has what this one cost.

A **sample** records a measurement, which cannot re-derive, so neither check is available to it. **There
are none left, and the one there was is the most expensive lesson in this section.** `spec-cost.json`
recorded what every spec cost in milliseconds, so that a gate could move a file between the fast and
integration halves. It was deleted on 2026-10-05, and what it cost to keep is the thing to read before
adding another sample:

- Treated as a derivation it churned — measured 2026-09-28, **125 of 163 entries changed between two runs on
  an idle machine** while the answer it supported changed zero times. So it needed hysteresis on the record,
  a band rather than equality for its check, and a refusal to record a run that had moved too much to have
  been measuring the code.
- Those three were not enough, because hysteresis says nothing about *which* reading became the answer: the
  first one in won, and for a crossing it won outright. Measured 2026-10-03, a recording at 78% idle moved
  two specs across the upper edge and the gate demanded two renames nobody had earned; the same band then
  stopped two clean runs correcting it, since displacing a value takes 35% of it. So it grew a **window** of
  readings whose median was the answer — one reading kept but unable to decide, two that agree able to.
- A millisecond is a fact about a machine, so it also needed a `machine` field, a path for a record measured
  on another box, and an idle floor on recording.
- And a sum of it needed a drift report, because a correlated slowdown sits under every per-spec tolerance.
  That report fired on one file's noise in five of the twelve records, where a single spec was 64% or more of
  the body (`@abuddy/ui` 93%, `main` 89%, `@abuddy/sdk` 86%) and the worst single spec moves 74% between two
  quiet runs.

**What finally settled it was not the cost of the apparatus but a contradiction.** Once each spec was
measured in the pool that actually runs it, one read 2.8s in the fast half and 0.64s in the integration
half — 4.37x apart, against a band of 2.5x. It was over the upper edge in one half and under the lower edge
in the other, so a gate acting on either reading demanded a move the other reading demanded back. The
quantity was never one number, and no amount of hysteresis fixes that.

So the half is a decision now, declared by a filename, and nothing re-derives it
(`scripts/lib/spec-halves.ts`). Slowness is reported where it happens rather than adjudicated against a
record, in three places: vitest prints any test over its 300ms `slowTestThreshold` under its file, the
chain prints each step's five slowest tests (`slow-tests.ts`), and each unit pool prints its five slowest
*files* per half, ranked, which is the one thing vitest's output does not give
(`scripts/lib/spec-durations.ts`), **with each half's total beside it**, since a ranking says what is worst
and never whether a half is getting heavy — measured, the five slowest hold 46% of one suite's fast half and
97% of another's. Both reach `npm run chain` and `npm run test:unit`, which buffer a step's output and print
it only on failure: until that was wired the pools printed a ranking nobody running either command saw.
A spec may say in its header why it is slow — `// @slow: <reason>` — and
the pool holds that marker to still being true: a marked spec that is no longer in its half's slow tail
fails the step, quoting the reason, so the remedy is to drop the marker. **Only that direction is a gate.**
Load inflates a duration — 1.27x median, 3.29x at worst — so it can hide a stale marker and cannot invent
one; an *unmarked* spec that reads slow is therefore reported and never failed. The bar is the half's p90
from the same run, so a slow run moves the file and the bar together, which is what a fixed millisecond
could not do: measured, it left two of the five markers 13% clear of a 2,500ms edge and 5.2x clear of this
one.

**"Load cannot invent one" is true of the file's time and was never true of the bar**, which is that same
p90 — so what the gate also needs is a population the marked file belongs to. A pool runs the projects whose
inputs moved, so most runs are partial, and a marked spec at a constant duration is above or below a partial
run's bar depending on which projects ran beside it: measured 2026-10-06 by holding one at 2,900ms and
changing only its neighbours, it was stale against a bar of 7,000ms in an 11-file run and 5,600ms in a
31-file run, having not moved. So `placementOf` takes `whole` and checks no marker without it, reporting the
half as unchecked the way it already did for one too small to have a tail. It was unreachable when found —
only four files are slower than the slowest marked one and each sits in a project of 61 to 100 files, so two
slow files can never be a tenth of a run — and that is arithmetic about this suite rather than anything the
code held, which is the kind of safety worth replacing rather than recording. **The lesson for a future sample: price the apparatus against the decision it informs.** 1,884 lines, twelve records, two idle floors and a machine identity decided which of
two config files a spec was listed in, where nine of twelve packages had only one config to begin with.

**And the successor carries a deletion condition from the start, which is the part this lesson was missing.**
`spec-cost.json` accumulated one only in hindsight. The `@slow:` marker gate — `SLOW_QUANTILE`, `tailBar`,
`slowReason`, `markedSpecs`, `placementOf`, the outlier detector and their six describes, about 550 of the
1,901 lines across `spec-durations.ts`, its reporter and their specs, plus 115 in `unit-pool.ts` and its
spec where the report is printed — guards eleven annotations in one direction, and its failure
mode is a stale comment. What it is *for* is whether a spec should move between halves, and as of 2026-10-06
that decision has been made **zero times**.

**A year's wait cannot tell you why, which is the correction the condition needed.** All eleven markers sit
in packages with a single vitest config, so the move the remedy names costs a new config and a root project
entry rather than a rename — `hasSplit` is where that fact lives, and nothing counted the markers against it
until a passing run started printing the count (`markerReachLines`). While that count equals the marker
total the decision is *unavailable* rather than unmade, and a year would pass with nothing having moved
whatever anyone decided. So: delete the gate and keep the ranking — the other 1,000 lines, read either
way — once either a year passes with no spec having moved halves on this evidence **while a move was
available to it**, or the markers are judged not worth their weight. Both are judgements rather than things
a run can check, which is why they are prose; the mechanical halves are cases — that the markers have not
collapsed to none, in `markedSpecs`' describe, and how many of them could move, in `poolDurationLines`'.

**And the reported half was computed where no passing run could print it**, which is the defect that found
all of the above. `placementOf`'s unmarked list was written only to the pool's own stdout, and both callers
buffer a step's output and print it on failure alone — so the direction deliberately left as a report was
visible only when something else broke, which is the one shape the four ways of saying a result is partial
forbid. It is a line on the pass path now, naming the files rather than counting them, because the ranking
beside it is ordered by cost and that list by test time, so an unmarked file in the tail need not be among
the rows a reader can see. On the first run it printed, the integration half's two slowest files — 41.3s and
31.5s — were both unmarked.

**One window came back, and it is worth saying why it is not a sample in the fatal sense.** The duration
cache (`scripts/lib/spec-durations.ts`) keeps ten readings per suite and half. It is uncommitted, it cannot
leave the machine that wrote it, and **nothing compares it against an edge** — its whole output is one
`(was Xs over N runs)` column on the five slowest files a pool already prints. That is the distinction to
carry: what made `spec-cost.json` cost 1,884 lines was not keeping readings, it was *deciding* with them.
A record that informs a column needs no hysteresis, no band, no tie rule, no machine field and no idle
floor, because there is no threshold for a reading to be wrong about. The file count does not grow either,
so the prune still answers for every name in the directory.

**The chain's `seconds` table is the sample-shaped thing that remains**, and it is a different case: its
subject is one machine by declaration (`MEASURED_ON`), `--record` refuses any other, and its drift report
answers the concentration objection outright — `driftVerdict` recomputes the movement without the largest
mover, so a drift one step carried is named as that step's with `--forget --step <name>` as the remedy, and
only a movement that survives the exclusion is called the table's.
