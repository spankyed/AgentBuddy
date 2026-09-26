> **Partly overtaken, 2026-09-25.** Phase 4 is **done** (`1b3eb9876`), at the tier rather than per test —
> and it was right about the test it named: "generated sends compile" failed a chain run at 5.8s under three
> lanes against a 5s default, exactly the flake the phase predicted. One "Finished when" clause is already
> met by other work: `npm run test:unit` is 37.6–40.8s against its 43s target, delivered by
> [`goal-one-job-pool.md`](../archive/goals/goal-one-job-pool.md)'s pooling. **Phases 1, 2, 3 and 5 are
> untouched and still the point** — the suite-time sum is what bounds any arrangement of lanes, and
> `default-setup` and `@abuddy/sdk` are still 51% of it. Its Background table is re-measured in place for the
> eleven suites that exist now; re-read the targets before Phase 1, not the 2026-09-25 originals.

> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-25). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: the unit suites cost what they do, not what they wait for

Implement docs/goals/goal-unit-suite-cost.md on AS/test-pipeline, at or after c7517e0da — the base
its Background was measured at. Read Background, Decisions, Phases and
Constraints first. Decisions are final: implement them, don't reopen them or stop to ask.

Before Phase 1, confirm the base: `npm run test:unit` reports "2 lanes" and finishes in about 43s,
scripts/test-unit.ts exists and takes ABUDDY_TEST_LANES, and packages/default-setup/tests/setup.ts
calls setupPackTests at module scope. If they don't, stop and say so — the numbers below are
arithmetic about where the time goes, and a stale base invalidates them.

Then re-measure the per-suite table with nothing else running. Every number in this doc is from
2026-09-25 on a 10-core machine, and a contended run has already produced a 36% error here.

Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo
caller, test and doc in the same change, and fix forward.

Finished when:
- Phases 1-5 are implemented and each meets its "Done when".
- `npm run test:unit` is measurably faster than 43s on an idle machine, or the phase that would have
  made it so is closed with the measurement saying why not. A number that did not move is a result.
- The suite-time total (the sum of the eight suites run alone, 52.6s today) has dropped, since that
  is what bounds the wall clock however the lanes are arranged.
- No test is deleted or loosened to make a number. Coverage is not the lever here; cost is.
- Every test that hits vitest's 5s default under load has a timeout sized to what it does, and the
  size is justified by a measurement rather than raised until it passes.
- npm run chain passes once at the end; npm run typecheck; npm run lint:check.
- The Outcome records: the per-suite table before and after, the contention tax before and after,
  what each phase moved, and what it cost to move it.

Commit as you go:
- Commit each phase when its "Done when" holds and its suite is green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` first: something outside the session stages files.
- Don't push, tag, or open a PR unless the user asks.

Never:
- Constraints' standing rules are hard stops, not advice: no push/tag/PR, no publish or release, no
  real data dir, no broad pkill, no bare tsc on preload, no version metadata, and no change to the
  typed EARS types to make a call site compile.
- delete or skip a test to make a suite faster; that is the one lever this goal refuses.
- raise a timeout past what a measurement justifies, or raise one to hide a genuinely slow test.
- measure on a machine running anything else, including another agent's suite.
```

## Background (2026-09-25, at c7517e0da on AS/test-pipeline)

`goal-test-cleanup.md` Phase 2 made `test:unit` run its suites concurrently and set a target of 25s. It
reached 43s and stopped. This goal is the part that was left.

### Where the time is

> **Re-measured 2026-09-25** at `07afe0bc2`, idle, same machine. The table below it is the original survey
> at `c7517e0da`, kept because the Decisions were taken against it. Eleven suites now rather than eight:
> `@app/repo-checks`, `@abuddy/testing` and `@abuddy/ui` were created by later goals, and `@abuddy/cli`
> gave twenty specs away to them.
>
> | Suite | Alone | Tests |
> |---|---|---|
> | `@app/default-setup` | **15.9s** | 718 |
> | `@abuddy/sdk` | **12.3s** | 539 |
> | `@abuddy/host` | 8.9s | 680 |
> | `@abuddy/cli` (fast half) | 5.3s | 319 |
> | `@app/api` | 3.1s | 70 |
> | `@abuddy/ears` | 3.0s | 116 |
> | `@app/renderer` | 2.5s | 33 |
> | `@app/repo-checks` | 2.1s | 177 |
> | `@abuddy/ui` | 0.9s | 2 |
> | `@app/main` | 0.8s | 23 |
> | `@abuddy/testing` | 0.8s | 19 |
> | **Sum** | **55.5s** | **2,696** |
>
> **The diagnosis is unchanged: `default-setup` and `sdk` are 51% of it**, exactly as before. The sum rose
> from 52.6s only because there are three more suites; the two targets did not move (14.7 → 15.9s,
> 12.0 → 12.3s), and `@abuddy/cli`'s fast half fell 8.9 → 5.3s by giving specs away rather than by getting
> faster. **`npm run test:unit` is 37.6–40.8s**, already under this goal's 43s target — delivered by
> `goal-one-job-pool.md`'s pooling, not by this goal. What is left here is the sum, which bounds what any
> arrangement of lanes can reach.

Per suite, run alone, warm, on a 10-core machine:

| Suite | Alone | Tests |
|---|---|---|
| `@app/default-setup` | **14.7s** | 720 |
| `@abuddy/sdk` | **12.0s** | 539 |
| `@abuddy/cli` (fast half) | 8.9s | 475 |
| `@abuddy/host` | 8.1s | 684 |
| `@app/api` | 3.0s | 70 |
| `@abuddy/ears` | 2.9s | 116 |
| `@app/renderer` | 2.3s | 33 |
| `@app/main` | 0.7s | 19 |
| **Sum** | **52.6s** | 2,656 |

`default-setup` and `sdk` are **51%** of it.

### Why lanes cannot close the gap

| Lanes | Wall | Suite time | Failures |
|---|---|---|---|
| 1 (control, same script) | 69.8s | 69.8s | 0 |
| **2 (today)** | **43s** | ~86s | 0 |
| 3 | 44.4s | 130.7s | 6 |
| 8 | 63.1s | 260.9s | 2 |

Two facts fall out of that table. **Perfect packing of 52.6s over two lanes would be 26.3s**, so most of
the distance from 26.3s to 43s is not the suites' own cost — it is the **1.63× contention tax**: suite
time inflates from 52.6s to ~86s when two run at once. And **more lanes buy nothing**: three lanes
measures 44.4s against two lanes' 43s, because a suite already uses 2.0-3.8 of the ten cores and the
extra lane only contends for what is left.

The failures at three and eight lanes are not a race. Every one is a test hitting vitest's 5s default
under contention — first `@abuddy/sdk`'s "generated sends compile", which takes **1.3s alone and 5.2s
under three lanes**. Raising that one package's timeout to 20s does not fix it: measured, the failure
moves to `@abuddy/cli` timing out at the same 5s. The margins are thin across suites.

### The one cost already identified

`packages/default-setup/tests/setup.ts:33` calls `setupPackTests({ seedRuntime, registration })` at
module scope, so it runs once per test file. Measured earlier in `goal-test-tiers.md`: ~1.16s × 84 files,
which a run reports as `setup 97.3s` — that figure is the sum across workers against a 15.4s wall, which
is why it reads as alarming and is not. It is still the largest single identified item inside the largest
suite. Nothing equivalent has been measured for `@abuddy/sdk`.

## Decisions

Final.

1. **The target is a measured floor, not 25s.** Phase 2's 25s was written before the contention tax was
   known. What this goal owes is a smaller number with the reason attached, and the floor stated. If the
   floor turns out to be 30s, that is the answer.
2. **Lane count is not a lever and is not to be revisited.** The table above is the measurement. Changing
   `ABUDDY_TEST_LANES`'s default is out of scope until Phase 4 has sized the timeouts, and then only if a
   measurement says it helps.
3. **Suite time is the number that matters.** Wall clock is bounded by the sum of the suites however the
   lanes are arranged, so a phase that lowers wall without lowering suite time has moved the contention
   around rather than removed work.
4. **Cost, never coverage.** No test is deleted, skipped or loosened to make a number. `goal-test-cleanup.md`
   already removed what did not earn its place; what is left is paid for.
5. **A timeout is sized from a measurement.** Phase 4 sizes each thin margin at about four times what the
   test costs alone, the same rule `chain-steps.ts` uses for step budgets. Raising one until it passes is
   the failure mode, not the fix.
6. **Measure alone, then together.** A suite's own cost is measured alone; the contention tax is the
   difference. Reporting only the together number hides which of the two moved.

## Phases

### Phase 1 — Find where the two big suites spend their time

- Per-file totals for `@app/default-setup` and `@abuddy/sdk`, by the recipe in
  `goal-cli-suite-spawns.md` Decision 6 (the reporter gives per-test lines; the totals have to be summed).
- Separate setup cost from test cost: a suite's `setup` figure is a sum across workers, not wall clock.
- No changes. The output is the table the next phases are sized against.

**Done when:** both tables are in the doc, and the largest item in each is named with what it costs.

### Phase 2 — default-setup's per-file harness setup

- `setupPackTests` runs once per test file (`tests/setup.ts:33`). Establish what it does per file that
  could be done once per worker, and do that much.
- Keep the isolation it provides: tests that share a registry or a database between files is not a
  trade this goal makes. If the isolation is what costs, say so and stop.

**Done when:** default-setup's alone-time has dropped with its test count unchanged, or the phase is
closed with the measurement showing the cost is the isolation. **Mutation:** a test that mutates the
registry still cannot see another file's changes.

### Phase 3 — @abuddy/sdk's largest item

- Phase 1 names it. Same shape as Phase 2: remove work, not coverage.

**Done when:** sdk's alone-time has dropped with its test count unchanged, or the phase is closed with
the measurement.

### Phase 4 — Size the thin timeouts — **done 2026-09-25 (`1b3eb9876`), by a different mechanism**

This phase was right, and it was right about the specific test. It sat unactioned, and on 2026-09-25 the
prediction below came true in a chain run: `@abuddy/sdk`'s "generated sends compile" — 1.3s alone — took
**5.8s under three lanes** and failed with *"Test timed out in 5000ms"*. A 4.5× multiplier against a 5s
default, in a suite whose tier allows 15s.

**It was fixed at the tier rather than per test**, which is the opposite of what Decision 5 below asks and
is the better answer. Five of the thirteen configs declared no timeout at all — `abuddy-ears`,
`abuddy-host`, `abuddy-sdk`, `main`, `renderer` — so every spec in them ran on vitest's 5s/10s defaults,
*tighter* than their tier. The budget belongs to the tier (`TIER_TIMEOUT_MS`), not to each test that trips
over a default, so all five now declare it, and `suite-timeouts.spec.ts` gained the half it was missing: it
checked a ceiling and left silence as an unrecorded third state, which was the state that bit. It now
requires each config to declare its tier's budget. The next test in line was a 4.1s lock test in
`@abuddy/host`, at 82% of a budget it never chose.

So **Decision 5 is superseded for this case**: a per-test timeout is for a test that genuinely needs longer
than its tier, and `TIMEOUT_EXCEPTIONS` is where those are recorded. It is not the fix for a suite running
on a default nobody chose.

~~- Every test that hits the 5s default under two or three lanes gets a timeout sized per Decision 5.~~
~~- This is not a speed change. It is what makes a lane measurement mean anything.~~

**Done when:** three lanes runs green five times in a row. **Mutation:** dropping one sized timeout back
to the default fails that run — done, in the other direction: dropping `hookTimeout` from `@abuddy/sdk`'s
config fails `suite-timeouts.spec.ts` by name.

**The five-run bar is met.** Five `chain -- --all` runs, three lanes with every step forced, on a clean and
fully committed tree: **192.5s, 192.1s, 185.0s, 173.0s, 201.7s — all green.** An earlier attempt at the same
five was abandoned after two because the next goal began editing spec files while they were in flight, and a
flake measurement taken over a tree being edited is evidence about nothing; these five were run on a quiet
one.

### Phase 5 — Re-measure, and state the floor

- The per-suite table, the contention tax, and the lane table again, on an idle machine.
- If a lane count other than two is now both faster and green, change the default and say what it cost.
- Record the floor: what `test:unit` cannot go below without a change this goal ruled out.

**Done when:** the Outcome carries both tables and the floor, and `npm run chain` passes.

## Deferred

- **Caching `test:unit` per package.** `goal-test-tiers.md` Phase 5 owns it, and it is a different
  question: this goal makes a run cheaper, that one skips it.
- **The `@abuddy/cli` integration half (44s).** It spawns by design; `goal-cli-suite-spawns.md` has it.
- **`test:packaged-authoring`'s npm installs**, tracked in `goal-test-tiers.md`.

## Constraints

The repo's standing rules (root `CLAUDE.md`) apply:

- commit each phase as it finishes, no attribution lines, `git commit -- <paths>`; check
  `git diff --cached` first. Pushing, tagging and PRs are on request.
- no publishing, releases or triggered workflows; no real data dirs, no broad pkill.
- preload, example pack and release metadata rules; typed EARS types are change-controlled.
- published packages: `api:update` after export changes, with `etc/` committed.
- investigate a failing test before touching it; a test that fails while being made faster has found
  something.
- **measure on an idle machine, and check first.** `git status` and `ps` before taking a number: a
  contended run has already produced 249s for what is 182.6s idle here, a 36% error — larger than any
  single phase below is likely to save.
