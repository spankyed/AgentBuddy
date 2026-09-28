# Goal: `npm run spec` never reports a pass it did not earn

> **Written in session** `bc6d43e0-1c60-4cad-8237-15508a9e6649` (Claude Code, 2026-09-28). Resume it with `claude -r bc6d43e0-1c60-4cad-8237-15508a9e6649`.

```
# Goal: npm run spec never reports a pass it did not earn

Implement docs/goals/goal-spec-earns-its-pass.md on master, at or after 56ba5bcad — the base its
Background was surveyed at.
Before Phase 1, confirm the base: `npm run spec -- packages/renderer/src/main.ts` prints "No test files
found, exiting with code 0" and exits 0, and scripts/lib/spec-plan.ts exports matchByName, tooBroad and
planTargets. If either is already false, stop and say so — the survey was taken somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root CLAUDE.md, "Backward compatibility" — a standing rule,
not this goal's choice): change signatures, migrate every in-repo caller, test, fixture and doc in the
same change, and fix forward.

Every number in Background was measured on 2026-09-28 on a 10-core machine with nothing else running.
Re-measure before you use one to justify a choice: a contended run has produced a 36% error here.

Finished when:
- Phases 1-4 are implemented and each meets its "Done when"; every new route, helper and guard is
  mutation-checked.
- No target naming a file that exists can exit 0 having run no spec. A source file nothing covers says
  so, names what would cover it where that is known, and exits non-zero.
- The two edges no module graph can see — a pack's seed sources to its goldens, and abuddy.json to the
  generated tree — are declared routes in scripts/lib/spec-plan.ts, asserted by repo-checks'
  spec-plan.spec.ts, and named in the root CLAUDE.md beside the other spec commands.
- A failing run stops the plan instead of paying for the runs behind it.
- `npm run spec:dry` prints the plan, the specs it would run and what the record says they cost,
  running nothing.
- Checks: npm run typecheck; npm test -w @app/repo-checks; npm run spec-cost:check; npm run chain once
  at the end.
- A final summary: phase -> done/deferred, evidence, the conventional choices made, and the measured
  cost of the collection Phase 4 adds.
- The doc is in docs/archive/goals/, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` and `git status` first: another agent works in this checkout and stages
  files. Commit only what this goal touched.
- Don't push, tag, or open a PR unless the user asks.

Never:
- the standing prohibitions in Constraints: git pushes/tags/PRs, publishing and workflows, real data
  dirs and broad pkill, bare tsc in packages/preload, npm install in the example pack, release
  metadata, widening the typed EARS types, backward-compat shims, loosened assertions.
- edit a recorded cost by hand: packages/*/etc/spec-cost.json moves only through spec-cost:update.
- make the ordinary `npm run spec` pay for a collection pass it does not need — Decision 5 says which
  route pays and why.
- fail a run that legitimately executed nothing: a pool skipping on its own stamp is not a coverage
  hole (Decision 2).
```

## Background (surveyed 2026-09-28 at `56ba5bcad` on `master`)

[`goal-spec-follows-the-graph.md`](../archive/goals/goal-spec-follows-the-graph.md) made `npm run spec` route a
source file through the module graph: one root `vitest related` over every host project, so editing
`@abuddy/sdk` runs the 104 specs that cover it rather than the one package it lives in.
[`goal-pack-test-config.md`](../archive/goals/goal-pack-test-config.md) closed the pack side, so a pack's own
source walks the pack's graph instead of running its whole 89-spec suite. `scripts/lib/spec-plan.ts` is the
routing as data and `packages/repo-checks/tests/spec-plan.spec.ts` asserts it in 33 cases.

What is left is the honesty of the answer. Three things, all reproducible at this commit.

### 1. An empty answer is reported as a pass

```
$ npm run spec -- packages/renderer/src/main.ts
→ every spec covering packages/renderer/src/main.ts
No test files found, exiting with code 0
$ echo $?
0
```

`vitest related` exits 0 when the graph reaches no spec, and `scripts/spec.ts:84` reads a run's status as the
whole verdict. So "nothing covers this file" and "everything that covers this file passed" are the same
output and the same exit code — which is the defect the archived goal's own Background called *confidently
wrong*, in the one shape its fix did not cover.

It is not one file. Collected through vitest's node API against the root config (counts are the specs
`related` would run):

| Source file | Specs covering it |
|---|---|
| `packages/renderer/src/main.ts` | **0** |
| `packages/api/src/server.ts` | **0** |
| `packages/main/src/index.ts` | **0** |
| `packages/renderer/src/views/settings/index.ts` | **0** |
| `packages/abuddy-ui/src/design/button.ts` | **0** |
| `packages/main/src/app-context.ts` | 2 |
| `packages/abuddy-host/src/services/index.ts` | 16 |
| `packages/abuddy-sdk/src/fe/settings.ts` | 19 |

Five of eight sampled files — composition roots and entry modules, which is where an uncovered edit is most
likely and least expected — answer 0 and exit 0.

The router already refuses to pass quietly for a *name* that matches nothing (`unmatched`, exiting 1, and
`spec-plan.spec.ts`' case *"reports a target that matches nothing instead of passing quietly"*). The same
claim is not made for a file that exists and nothing covers.

### 2. A seed source claims coverage it then does not run

```
$ npm run spec -- packages/default-setup/src/seeds/actions/claude-code/answer-question.ts
→ @app/default-setup: every spec covering src/seeds/actions/claude-code/answer-question.ts
No test files found, exiting with code 0
$ echo $?
0
```

The label states the claim and the run refutes it. The specs that do cover that file are
`packages/default-setup/tests/seeds/seed-parity.spec.ts` and `tests/seeds/compiled-bodies.spec.ts`, which read
`dist/*.seed.json` — so the edge is `src` → `abuddy build` → compiled seed → golden, a build edge of exactly
the shape the archived goal closed for the `dist` seam, and nothing routes it. That goal recorded it, under
*"What the graph still cannot see"*, along with `abuddy.json` → codegen → specs, which has the same shape: the
generated tree is imported by specs, so a *regenerated* tree is covered, while editing the manifest alone
reaches nothing.

It was recorded in the right words in the wrong place. `docs/goals/README.md` says an archived doc *"records
the code as it was … read it as history"*, and that for an invariant *"prose in an archived doc is not [a
guard], because the archive describes the past"*. Two known holes in the current router live only there.

### 3. The cost and the tier are recorded artifacts the router does not read

Both exist and both are gated. `scripts/lib/chain-steps.ts` declares a tier per chain step and
`npm run check:tiers` fails a tier-1 or tier-2 step that can reach the app. `packages/<pkg>/etc/spec-cost.json`
records a measured millisecond count per spec file, written by `spec-cost:update` and checked by
`spec-cost:check`. `scripts/lib/spec-plan.ts` imports neither — `unit-suites.ts` and `workspace-deps.ts` are
its only inputs, and the word "tier" appears in it twice, both times in prose.

What the record holds today, summed from the twelve per-package files (`measuredAt` between 2026-09-25 and
2026-09-28):

| Suite | Specs | Recorded file-time | of which the integration half |
|---|---|---|---|
| `abuddy-cli` | 54 | 144.1s | 132.0s |
| `publish-checks` | 9 | 28.9s | 27.1s |
| `abuddy-host` | 81 | 20.1s | — |
| `repo-checks` | 24 | 19.3s | 14.2s |
| `default-setup` | 89 | 13.4s | — |
| `abuddy-sdk` | 56 | 12.8s | — |
| `api` | 15 | 5.3s | — |
| `abuddy-ears` | 9 | 2.5s | — |
| `main`, `renderer`, `abuddy-testing`, `abuddy-ui` | 17 | 0.5s | — |
| **total** | **354** | **246.9s** | 173.3s |

The record covers the answers the router gives. For the 104-file root run above, **every one of the 104 files
had a recorded cost**, summing to 36.0s of file-time; the run's measured wall time was 23.3s (`Duration
21.82s`, 1024 tests). So a prediction is available and has to be stated as file-time with the ratio said out
loud — 36.0s of file-time is 23.3s of wall across workers, and reporting the sum as a wall-time promise would
be wrong by half.

Collecting the answer without running it is cheap, through `createVitest({ related })` and
`getRelevantTestSpecifications()`:

| Target | Specs | Collection |
|---|---|---|
| `abuddy-sdk/src/types/sdk-entities.ts` | 104 | 5.7s cold, 1.7s warm |
| `abuddy-ears/src/query.ts` | 146 | 4.6s |
| `main/src/app-context.ts` | 2 | 1.8s |
| `renderer/src/main.ts` | 0 | 2.6s |

**Collection cost is flat in the size of the answer** — it is the eleven project configs being loaded, not the
graph being walked. Roughly 2s warm whatever comes back, which is 9% of the 23.3s root run and most of a
one-spec run.

### Already closed, recorded so nobody re-chases it

Two items from the review that produced this doc are fixed at this commit, and a reader of that review would
otherwise go looking:

- **`vitest related` crashing in `@app/default-setup`** (`Failed to parse source for import analysis …
  Install @vitejs/plugin-vue`) is gone: `definePackTestConfig` (`@abuddy/testing/vitest`) stubs a pack's `.vue`
  files, so the walk no longer stops at the first SFC. That was
  [`goal-pack-test-config.md`](../archive/goals/goal-pack-test-config.md).
- **Two suites racing each other's package build** is gone: readers wait on an in-flight build and builders
  wait on the lock rather than failing on it (`packages/abuddy-host/src/build/packages-built.ts`, and the root
  `CLAUDE.md`'s note on running suites concurrently before the packages are built).

## Decisions

1. **A run that executed no spec is not a pass.** `npm run spec` exits non-zero and says which target
   produced no answer. Three exit codes, documented in `scripts/spec.ts`' header because an agent reads
   them: **1** a spec failed, **2** a name was wide enough to be a search and was listed instead of run
   (already shipped), **3** a target that exists is covered by no spec. Distinct codes, because the three
   need different next moves and only one of them is a bug in the code under test.

2. **Emptiness is decided from the run's own report, not by collecting first.** The run already knows what it
   ran; asking a second process would double the ~2s collection on every source-file target to learn
   something the first process is about to tell us. So the `related` and `--changed` runs write a JSON
   reporter to a temp file beside the human output, and `spec.ts` reads the file count back.

   **Only a run that carries a coverage claim is judged this way.** A run that legitimately executes nothing
   is not a hole: `test:unit:pack` skipping on its own stamp, and a filtered run whose `-t` pattern matched no
   case, both report zero and both are correct. The claim belongs to the route, so it is a field on `Run`,
   set by the two `related` routes and the `--changed` route and by nothing else.

3. **The two edges no module graph can see are declared routes, reported by default and run under `--full`.**
   This is the mechanism `packSuiteNote`/`packSuiteRun` already is, reused rather than reinvented, and it
   inherits that decision's shape for the same reason: the note costs nothing and the run costs a build.
   - `packages/<pack>/src/seeds/**` → that pack's `tests/seeds/`, through `npm run compile -w <pack>`.
   - `packages/<pack>/abuddy.json` → that pack's whole suite, through the same build, codegen rewriting
     `src/__generated__/` being a change to what every spec in the pack imports.

   The routes are data in `spec-plan.ts` and derived from the pack's own layout, not a hand-written list of
   two packs: `spec-plan.spec.ts` partitions the packs under `packages/` the way it already partitions those
   that reach a pack suite, so a third pack cannot arrive unrouted.

4. **A failing run stops the plan.** `spec.ts` runs every run in the plan and counts failures, so a 1s
   tier-1 failure still pays the 18s pack suite behind it, and a named `tests/e2e` spec behind a failed root
   run costs 26s to tell you nothing. A failure is the answer; the runs behind it are a bill for information
   already obtained. `--no-bail` keeps the old behaviour for the case where you want every failure at once.

5. **A prediction is opt-in, as `npm run spec:dry`, and the ordinary run pays nothing for it.** Collection is
   flat at ~2s: worth it against a 23.3s root run, not against a 3s one, and the router cannot know which it
   has until it has paid. Rather than guess, the prediction is its own command — `<action>:<variant>`, as
   `spec:full` already is — printing the plan, the spec paths and their recorded cost, and running nothing.
   That also makes it the command to reach for when the question is *"what would this run?"*, which today
   takes running it.

6. **No tier ordering.** The review that produced this doc asked for tier-ordered escalation, and measuring
   the plans retired it: `planTargets` already emits `packages:ensure`, then the graph runs, then named specs
   grouped by package, then the `--full` pack suite, which is cheap-first for every plan the router can
   produce. The cost was never the order, it was that nothing stopped — which is Decision 4, and is three
   lines rather than a tier model for a second scheduler. Giving a spec a tier by inference is the thing not
   to do: a tier is declared (`chain-steps.ts`) and `check:tiers` is what makes it mean anything.

7. **A predicted cost is stated as file-time, with the wall ratio said out loud.** 36.0s of recorded
   file-time ran in 23.3s of wall; the sum is what the record holds and the wall is what the user waits.
   Printing the sum alone would overstate every answer by about half, and calibrating a ratio per suite is a
   second recorded artifact to keep current. So it prints both the sum and the shape: *"104 specs, 36.0s of
   recorded file-time — about 20-25s of wall across workers"*.

## Phases

### Phase 1 — a zero answer is not a pass

- Add the coverage claim to `Run` in `scripts/lib/spec-plan.ts` (Decision 2), set by `rootRun` for the
  `related` and `--changed` routes and by `packRelatedRun`, and by nothing else.
- Add the pure verdict function beside it — given a run and the number of spec files it executed, one of
  `pass`, `fail`, `covered nothing` — so the decision is in the tested half of the split, as the file's
  header requires.
- `scripts/spec.ts`: give the claiming runs a JSON reporter to a temp file alongside the default reporter,
  read the executed file count back, and exit 3 when a claiming run executed none. The message names the
  target and, for a target Phase 2 routes, the command that does cover it.
- Document the three exit codes in `scripts/spec.ts`' header and in the root `CLAUDE.md` beside the spec
  commands.

**Done when:** `npm run spec -- packages/renderer/src/main.ts` exits 3 and says no spec covers it;
`npm run spec -- packages/abuddy-sdk/src/fe/settings.ts` still passes and exits 0; a `-t` pattern matching
no case still exits 0 (it is a filter, not a claim). New cases in
`packages/repo-checks/tests/spec-plan.spec.ts` assert which routes carry the claim and the verdict for each
of the three outcomes. Mutation: dropping the claim from the root route makes the empty case pass again, and
the new case fails.

### Phase 2 — the edges no module graph can see are routes, not prose

- Implement the two routes of Decision 3 in `spec-plan.ts`, derived from the pack's layout.
- A seed-source or `abuddy.json` target prints what covers it and how (the note), and under `--full` runs it:
  `compile -w <pack>` then the seed specs, or the pack's suite for a manifest change.
- Delete the corresponding sentences from `packages/default-setup/tests/seeds/CLAUDE.md` and the root
  `CLAUDE.md` where they describe the gap as permanent, and say what the router now does instead.

**Done when:** `npm run spec -- packages/default-setup/src/seeds/actions/claude-code/answer-question.ts`
names `tests/seeds/` and exits non-zero rather than 0 with nothing run; `npm run spec:full -- <that file>`
compiles the pack and runs the seed specs, and the golden failure a deliberately edited seed body produces is
the run's failure. `spec-plan.spec.ts` partitions every pack under `packages/` into routed and unroutable.
Mutation: removing the seeds route leaves the file answering zero specs, and the partition case fails.

### Phase 3 — a failure stops the plan

- `scripts/spec.ts`: stop at the first failing run, reporting which runs were not reached and why, with
  `--no-bail` for the old behaviour (consumed like `--full`, first position only, so *everything from the
  first `-` is vitest's* stays exact).

**Done when:** a plan with a deliberately failed first run exits 1 without running the rest, and names them;
`--no-bail` runs all of them. Measured and recorded in the phase: what a failed root run used to cost
against what it costs now, on the `--full` plan that carries the pack suite. A case in `spec-plan.spec.ts`
for the flag's position, beside the `--full` one.

### Phase 4 — the plan says what it would cost

- `npm run spec:dry` (`scripts/spec.ts --dry`, script in the root `package.json` beside `spec:full`): collect
  through vitest's node API for each `related`/`--changed` route, print each run, the spec paths it would run
  and the recorded cost of those paths, and run nothing.
- Read the per-package records through `scripts/lib/spec-cost.ts`, the module the check and the command
  already share, so a third reader cannot disagree with them. A spec with no recorded cost is counted and
  named, not silently treated as free.
- Print file-time and the wall shape (Decision 7).

**Done when:** `npm run spec:dry -- packages/abuddy-sdk/src/types/sdk-entities.ts` prints 104 spec paths and
their summed cost in under 8s cold, runs no test, and exits 0; the count equals what the ordinary run
executes. `npm run spec` with no `--dry` performs no collection — asserted by the plan's shape, and the
phase records its wall time against the pre-phase number to show it did not move. Mutation: a record with a
file removed reports one unpriced spec by name rather than a smaller total.

## Deferred

- **`@abuddy/cli`'s integration half.** 132.0s of its 144.1s, and 53% of the 246.9s the twelve records hold
  between them — the largest single cost in the repo's specs, and not a routing problem: those specs run real
  builds, and whether they can share one is the question. It belongs with
  [`goal-unit-suite-cost.md`](goal-unit-suite-cost.md), whose Phases aim at `default-setup` and `@abuddy/sdk`
  (the `test:unit` halves) and say nothing about the integration half. Recorded here so the number is written
  down where it was measured; the agent implementing this goal must not start it.
- **Tier-aware escalation**, refused with its reasoning in Decision 6 rather than deferred, so it is not
  proposed again without a measurement.

## Constraints

- Commit each phase as it finishes, in logical chunks, no attribution lines; `git diff --cached` and
  `git status` first, and `git commit -- <paths>` naming only that phase's files — another agent commits in
  this checkout. Pushing, tagging and PRs are on request only.
- No publishing, releases or triggered workflows; dry runs only.
- No real data dirs (`~/Library/Application Support/abuddy*`), no broad `pkill`/`killall`; the app launches
  only with an isolated `ABUDDY_USER_DATA_DIR`.
- No bare `tsc` in `packages/preload`, no `npm install` in the example pack, no version or release metadata.
- The typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- No backward-compat shims: change the signature and migrate every in-repo caller, test, fixture and doc in
  the same change. Stored user data is the exception and moves with a migration.
- Investigate a failing test rather than loosening it; every new route, helper and guard gets a mutation
  check (`docs/goals/README.md`, and the root `CLAUDE.md` on a check that may have looked at nothing).
- Recorded artifacts move only through their `:update` half: `packages/*/etc/spec-cost.json` through
  `spec-cost:update`, never by hand.
- Keep the loop fast: the narrow checks during the work (`npm test -w @app/repo-checks -- spec-plan`, the
  package's `tsc --noEmit`), the chain once at the end of a phase.
