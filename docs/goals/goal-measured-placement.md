> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-25). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: a spec's cost decides where it runs, in every package

Implement docs/goals/goal-measured-placement.md on `AS/chain-inputs`, at or after `9905b6b06`.
**Not master:** the commits this builds on were moved off it.

Before Phase 1, confirm the base: packages/abuddy-cli/etc/spec-cost.json exists and
`npm run spec-cost:check -w @abuddy/cli` passes, scripts/lib/spec-cost.ts exports `halfFor` and
`INTEGRATION_ABOVE_MS`, scripts/lib/test-timeouts.ts exports `timeoutOverrides`, and
`TIMEOUT_EXCEPTIONS` in packages/abuddy-cli/tests/build/suite-timeouts.spec.ts is empty. If they
don't, stop and say so — this goal is the second half of work those pieces are the first half of.

Then re-measure Background's two numbers with nothing else running: the slowest single test in the
repo, and the slowest file. Both are from 2026-09-25 on a 10-core machine, and this goal is
arithmetic about headroom, so a stale pair invalidates it.

Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo
caller, test, fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1-4 are implemented and each meets its "Done when"; every new guard or helper is
  mutation-checked.
- Every unit suite has a recorded per-file cost, not just the one package with two halves, and a
  spec with no recorded cost fails a check rather than defaulting silently.
- A spec that has outgrown where it runs is reported, and so is one that has become cheap enough to
  move back. An allowlist that only grows is the failure this exists to prevent.
- No spec's placement is decided by which package it happens to live in.
- npm run chain --all passes; npm run typecheck; npm run test:unit.
- Measured and recorded in the Outcome: the per-file cost distribution before and after, the slowest
  test and slowest file against their budgets, and what moved.
- A number that did not move is a result. If measured placement finds nothing to move, close this
  goal saying so — the mechanism still has to exist, but do not manufacture work for it.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` first: something outside the session stages files.
- Don't push, tag, or open a PR unless the user asks.

Never:
- Constraints' standing rules are hard stops: no publish or release, no real data dir, no broad
  pkill, no app outside the test env without an isolated ABUDDY_USER_DATA_DIR, no bare tsc on
  preload, no version metadata, and no change to the typed EARS types to make a call site compile.
- raise a tier budget to accommodate a spec. Decision 7 of goal-test-tiers.md exists because a large
  timeout turns a hang into a slow pass; the answer is to move the spec, not the ceiling.
- delete or loosen a test to make a number move.
- match a language construct with a regular expression. Two attempts failed in both directions and
  scripts/lib/test-timeouts.ts records what they cost; the compiler knows where things are.
```

# Goal: a spec's cost decides where it runs, in every package

`packages/abuddy-cli/etc/spec-cost.json` records what each of that package's 80 specs costs, and
`suite-split.spec.ts` decides from it which half each one runs in. It works, it is mutation-checked, and it
covers **one package of eight**. Everywhere else a spec's placement is whichever package it happens to sit
in, and there is nothing to notice when that stops being right.

This finishes what [`goal-one-job-pool.md`](goal-one-job-pool.md) started. That goal made cost the predicate
where a split already existed; this one makes it the predicate everywhere, and gives it the second half a
recorded list needs — a report when an entry has stopped applying.

## Background (2026-09-25, at `9905b6b06`)

### There is no pressure today, and that is the point

| | measured |
|---|---|
| slowest single test, whole repo | **4.0s** — `abuddy-host/tests/database/write-lock.spec.ts` |
| tier-1 budget | 15s, so 3.75x headroom |
| tests reporting over 300ms, of ~2634 | **38** |
| slowest single file | **18.6s pooled**, 10.6s alone — `abuddy-sdk/tests/build/generate-entries.spec.ts` |
| per-suite work / max floor | 68.5s / 10.4s |

Re-measured at `9905b6b06` before Phase 1. The slowest test held at 4.1s; the slowest *file* did not — it
is 18.6s inside the host pool against 10.6s run alone, the same ~2x contention that forced `spec-cost`'s
dead band. The pooled figure is the operative one, because placement is decided where a spec actually runs.

Nothing is close to its ceiling. That makes this preventive work rather than a fix, and it sets the bar for
judging it: **the goal is not to make anything faster.** It is that the next spec which does get slow is
moved on evidence, instead of being handed an exception — which is what the repo did fifteen times before
`goal-one-job-pool.md` Phase A-C found them, all of them 15x to 60x the slowest test that actually exists.

### Correcting the analysis this goal was proposed from

It was pitched as collapsing "three unsynchronised answers to how long may this take" into one. Measuring
says that is wrong, and the correction is why this goal is smaller than the pitch:

- `TIER_TIMEOUT_MS` bounds a **test**. It is a hang detector, and 15s against a 4.0s worst case is a ceiling
  nobody should be near.
- `spec-cost.json` measures a **file**. It is a placement input, and 10.4s against a 2.5s boundary is a
  decision made constantly.
- A per-test override was a third expression of the first. **That one is already closed** — the overrides
  are gone, `timeoutOverrides` reads the syntax tree, and `TIMEOUT_EXCEPTIONS` is empty.

So two of the three were one fact and are now unified. What is left is not a collapse; it is that the
*second* fact — a file's cost — is recorded for one package and inferred for seven.

### What "inferred" costs

`@abuddy/host`'s `write-lock.spec.ts` is that package's floor at 4.7s and holds the slowest test in the
repo. It carried a 90s override until Phase B removed it. Nothing measured it, nothing placed it, and
nothing would have said if it had grown to 20s except a timeout failure — at which point the only lever
available in a single-suite package is an exception, because there is no second half to move it into.

## Decisions

**1. Every unit suite has a recorded per-file cost.** One artifact per package, the shape
`spec-cost.json` already has, written by the command that already measures per-file times
(`scripts/measure-suites.ts` parses them today and throws them away).

**2. A spec with no recorded cost fails a check.** The failure mode being designed out is a silent default,
so an unmeasured spec is a missing record, not a tier-1 spec.

**3. Reporting goes both ways.** A spec that outgrew its placement, and a spec that has become cheap enough
to move back. Bazel reports a test that is "too fast for its size" for the same reason: a list that only
grows is one people stop reading.

**4. A package with one suite is a finding, not an exception.** Where cost says a spec does not belong in
tier 1 and the package has no tier 2, record it — do not raise the budget and do not invent a half for one
spec. The right answer may be that the package needs a split, and that is the next goal's evidence.

**5. The dead band carries over.** A file's recorded time is its wall time under whatever else its suite is
running, so a single threshold oscillates — measured, four specs moved back and forth on the first pass.
Two edges, and anything between stays where it is.

## Phases

### Phase 1 — Record every suite's per-file costs

Extend the cost artifact beyond `@abuddy/cli`. `measure-suites.ts` already parses per-file times for all
eight suites; what is missing is writing them down and a `check`/`update` pair per the repo's convention for
a recorded artifact.

**Done when:** every unit suite has a cost record; `spec-cost:check` covers all of them; a spec with no
recorded cost fails. **Mutation:** deleting one spec's entry fails the check by name.

### Phase 2 — Report a spec that has outgrown its placement

For each spec, compare its recorded cost against the budget of the step that runs it. Report, do not move:
this phase produces the list that Phase 3 acts on.

**Done when:** the check names every spec whose cost sits outside the band for its current placement, in
both directions. **Mutation:** editing a recorded cost past either edge names that spec.

### Phase 3 — Act on the list

For each spec Phase 2 names: move it (where a split exists), record that its package needs one (Decision 4),
or — if it is genuinely irreducible — give it an exception with a reason, in the shape
`TIMEOUT_EXCEPTIONS` already uses.

**Done when:** the list is empty or every entry on it is explained. **Mutation:** an exception whose spec no
longer qualifies fails the check.

### Phase 4 — Retire what the record replaces

Whatever still states a duration by hand and is now derivable. Take the measurement before and after, and if
nothing is left to retire, say so.

**Done when:** no hand-written duration remains that the record could state, or the Outcome records why each
survivor is not derivable.

## Deferred

- **Splitting a single-suite package into halves.** Decision 4 makes that a finding rather than work. Do it
  when the evidence names a package, not in anticipation.
- **Per-test durations as a staleness signal.** `slowestTests` parses tests over vitest's 300ms threshold,
  which is enough to show a test is cheap but not to show it is expensive. Worth building when an exception
  list is non-empty for long enough to need auditing; today it is empty.

## Constraints

`goal-test-tiers.md`'s standing rules carry over unchanged: no push, tag or PR; no publish or release; no
real data dir; no broad `pkill`; no app outside the test env without an isolated `ABUDDY_USER_DATA_DIR`; no
bare `tsc` on `preload`; no version metadata; no change to the typed EARS types to make a call site compile.

And three earned by the work that produced this goal:

- **Do not match a language construct with a regular expression.** Two attempts failed in both directions —
  one gutted a fixture by rewriting `setTimeout(() => {…}, 500)`, the other missed a 240s override written
  on a single line. `scripts/lib/test-timeouts.ts` records both.
- **Read what the tooling already tells you.** `driftedSteps` reported a wrong `seconds` on six consecutive
  runs and every one of them was filtered out by the reader's own grep.
- **A guard that checks where a value is declared has not checked where it is overridden.** That is the
  mistake this goal's predecessor made twice.
