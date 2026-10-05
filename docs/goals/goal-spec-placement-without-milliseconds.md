> **Written in session** `f122fdc5-84c9-467f-9c61-66330eab32d0` (Claude Code, 2026-10-05). Resume it with `claude -r f122fdc5-84c9-467f-9c61-66330eab32d0`.

```
# Goal: the spec-placement audit stops storing milliseconds

Implement docs/goals/goal-spec-placement-without-milliseconds.md on AS/drive-vocabulary, at or after
e111c0ba4 — the base its Background was surveyed at.
Before Phase 1, confirm the base: scripts/lib/spec-cost.ts exports WINDOW, costOf, disagrees and
worthKeeping; scripts/lib/measure.ts exports bodyDrift, drifted and DRIFT_SHARE; and both
scripts/chain.ts and scripts/spec-cost.ts call drifted(). If they don't, stop and say so — the plan
was surveyed somewhere else.
Read Background, Decisions, Open decisions, Phases and Constraints first. Decisions are final:
implement them, don't reopen them or stop to ask. Open decision 1 must be settled with the user
before Phase 3; if it is still marked open when you reach it, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — a standing
rule, not this goal's choice): change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward. Stored user data is the exception: it
moves with migrations. The spec-cost records are test expectations, not user data.

Phase 1 is a spike. Report its four results and stop before Phase 2.

Finished when:
- Phases 1-5 are implemented and each meets its "Done when"; every new guard is mutation-checked.
- No spec-cost record stores a millisecond cost, a `machine` field, or a window of readings. The
  audit's verdict is a per-spec streak, and `grep -r "WINDOW\|costOf\|worthKeeping\|disagrees"
  scripts/` finds only what Decision 6 keeps.
- Nothing measures spec costs in a process of its own: `spawnSync('npx', ['vitest'...])` is gone from
  scripts/spec-cost.ts, and the durations come from the suite run (Decision 2).
- `RECORD_IDLE_FLOOR`, `refusesAsContended` and `isMeasuredMachine` no longer gate the spec audit; a
  second machine can satisfy the audit with no `--force` (Decision 3).
- `bodyDrift`/`drifted`/`DRIFT_SHARE` have exactly one caller, scripts/chain.ts, and DRIFT_SHARE's
  basis for that caller is either re-measured or recorded as inherited with its reason (Decision 4).
- The chain's drift report says whether one step or the body moved, and names a remedy that fits the
  case it reports (Decision 5).
- npm run typecheck; npm run spec over every file touched; npm test -w @app/repo-checks;
  npm run chain. `npm run spec-cost:check` (or its replacement) passes on a deliberately busy box.
- A final summary: phase -> done/deferred, evidence, and the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files in this tree, and a
  pathspec commit leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- the standing prohibitions in Constraints below: git (push/tag/PR), publishing and workflows, real
  data dirs, broad process kills, bare tsc on preload, the example pack, release metadata, typed
  EARS, compat shims, loosened assertions.
- raise DRIFT_SHARE, or widen any band or threshold, to silence a report (Decision 7). A threshold
  that fires wrongly is a detector to fix or delete, not a number to inflate.
- delete scripts/lib/spec-cost.ts wholesale. Decision 6 names the recorded lessons that survive and
  where each goes; a deletion that takes them with it is the failure this goal is most likely to
  cause.
```

## Background (2026-10-05, at `e111c0ba4` on `AS/drive-vocabulary`)

`packages/*/etc/spec-cost.json` records what every spec file costs in milliseconds. `scripts/lib/spec-cost.ts` is 1,233 lines and `scripts/spec-cost.ts` 584, and between them they hold a window of up to three readings per spec (`WINDOW`, `spec-cost.ts:220`), a median with a deliberate length-two rule (`costOf`, `:247`), an agree-band (`disagrees`, `:367`; `worthKeeping`, `:390`), two idle floors, a contention refusal, a `machine` field, a path for a record measured on another box, and a body-drift report.

**What consumes a recorded cost.** Two things, and neither is the test runner:

1. **The audit.** `packages/repo-checks/tests/suite-split.spec.ts` fails when a spec is in the wrong half, has no recorded cost, or is recorded and gone.
2. **An advisory total.** `scripts/lib/spec-dry.ts`'s `priceSpecs` (`:52`) prints `npm run spec:dry`'s estimate. Its own header (`:11`) says the total "is deliberately allowed to sit up to `DRIFT_SHARE` from the truth", and the command prints `measuredAt` because the figure is a band rather than a number.

**Placement does not come from the cost.** `halfOfPath` (`spec-cost.ts:455`) reads the filename — `.integration.spec.ts` means the integration half — and the pool runner uses that half (`CONFIG_BY_HALF`, `scripts/lib/unit-pool.ts:16`). No runner reads a millisecond. `halfFor` (`:458`) compares a cost against `INTEGRATION_ABOVE_MS` (2,500) and `FAST_BELOW_MS` (1,000) to answer one question: *is this spec filed in the wrong half?*

So the millisecond is an intermediate value. The record stores it and re-derives a verdict from it, where the verdict is what both consumers of the audit actually want.

**The durations already come from the suite's own reporter.** `measure()` (`scripts/spec-cost.ts:69-100`) runs `spawnSync('npx', ['vitest', 'run', '--config', config])` and regex-parses vitest's default per-file lines (`FILE_LINE`, `:63`), reading both the pooled `|project|` prefix and the bare per-package form. The parse exists; what makes this a separate command is only that it starts its own vitest instead of reading the run that already happened.

**What the millisecond costs the design.** Because a millisecond is a fact about a machine rather than about the repo:

- `RECORD_IDLE_FLOOR = 0.85` (`measure.ts:159`) refuses to record on a busy box, measured because "at `IDLE_FLOOR` a permitted run drifts the body about as far as `DRIFT_SHARE`".
- The record carries `machine` and `spec-cost:check` reports differently off that box, because a second contributor could otherwise only satisfy `unrecorded` by writing their own box's numbers into someone else's record.
- `--all --force` exists so another machine can take the record over.
- A spec must be measured with its *config*, not alone: `chain-inputs` reads 1,688 ms beside its siblings and 963 ms on its own, against a 1,000 ms band, so a solo reading files it in the wrong half.

**The body-drift report, and why it is in this goal.** `bodyDrift` (`measure.ts:190`) compares the sum of a run's measurements against the sum recorded, and `drifted` (`:202`) raises it past `DRIFT_SHARE = 0.15` (`:199`). Its premise is in its own doc comment: *"Random jitter does not bias a sum — the lags fall both ways and cancel, which is why a spec suite's total moved 0.4%, 6.5% and 9.9% between idle runs while its members moved 10-18% each."*

That was measured on `@app/repo-checks`' fast half. Measured 2026-10-05 across all twelve records, five suites have a single spec at 64% or more of their body, so there is nothing for its jitter to cancel against:

| suite | specs | top spec's share of the body |
|---|---|---|
| `abuddy-ui` | 2 | 93% |
| `main` | 3 | 89% |
| `abuddy-sdk` | 61 | 86% |
| `abuddy-ears` | 9 | 79% |
| `abuddy-testing` | 10 | 64% |
| `repo-checks` | 46 | 12% — where the threshold was measured |

`measure.ts:120-131`'s own table records the worst single spec moving 74% between two *quiet* runs. At 93% concentration that is ~69% body movement from noise, four and a half times `DRIFT_SHARE`: the report cannot avoid false-firing on those suites. Observed on 2026-10-05 — `@abuddy/testing` reported +16% and `@app/repo-checks` −14% on one run, opposite directions, which is the signature of jitter rather than the correlated drift the report exists to catch.

**The remedy it prints does not fit the case that fires.** `spec-cost.ts:327` prints `--all --forget` on every branch, while that flag's own documentation calls it *"for a change you know about — a bundler bump, a policy change — and not to chase a drift you do not"*. For spec costs the report only prints: `drifted()` there is a `console.log`, and `spec-cost.ts:1100` records that a drift **gate** on the write already existed and was already removed (*"It replaced `rewritesEveryRow`, which was `all && drifted(body)` — a drift gate on a write"*). So the standing cost is a misleading sentence, not a blocked workflow.

**Removing the spec-cost caller orphans the threshold.** After this goal `bodyDrift` has one caller, `scripts/chain.ts:768`. Measured 2026-10-05, ten chain steps declare a `seconds` cost, totalling 266 s, with `test:packaged-authoring` at 91 s — **34% of the body, and the top three 62%**. That is the same concentration regime the premise fails in, the subject the threshold was calibrated on is the one this goal deletes, and nobody has measured the chain's own quiet-run body variance.

## Decisions

Final, except Open decision 1.

1. **The record stores the audit's verdict, not its input.** Per spec, the number of consecutive runs whose duration contradicted the spec's filename — a misfiled streak — plus the membership the audit already needs (`unrecorded`). No millisecond cost, no window of readings.

2. **The suite run is the measurement.** The pool runner (`scripts/test-unit-pool.ts`) parses the per-file durations it already causes vitest to print and updates the streak. Nothing starts a vitest of its own to price specs; `measure()`'s `spawnSync` goes. A spec is therefore always timed in the half and the pool it really runs in, which is what `chain-inputs`' 1,688-vs-963 ms gap says a cost must be.

3. **Machine-independence follows, and the machinery that existed for it goes with it.** A streak is a fact about the repo: the same verdict is reached on a slow box and a fast one, because the question is "did it exceed 2,500 ms", not "by how much". So delete, for the spec audit: the `machine` field and `isMeasuredMachine`, the foreign-record path, `RECORD_IDLE_FLOOR`/`refusesAsBusy`/`refusesAsContended`, and the `--all`/`--suite`/`--force`/`--forget` flags. `RECORD_IDLE_FLOOR` itself stays for `chain --record`, its other caller.

4. **`bodyDrift`, `drifted` and `DRIFT_SHARE` stay, for the chain alone.** Phase 5 either re-measures `DRIFT_SHARE` against the chain's own steps and records the method, or records in its doc comment that the value is inherited from a subject that no longer exists, with the reason that is tolerable. Not both, and not silence.

5. **The chain's drift report says which of two things happened.** Recompute the drift with the single largest mover excluded; if that lands inside `DRIFT_SHARE`, one step moved and the body did not — name the step. Then each branch names a remedy that fits it: body drift → `--all --forget`; one step → `--step <name>`, which already exists; neither → say the record will absorb it and advise nothing. No new constant: the discrimination is a second reading of data `bodyDrift` already holds.

6. **The lessons survive the milliseconds.** `scripts/lib/spec-cost.ts` records what several guards cost to learn, and three are still true of a streak. Carry each into the new module's comments where it explains a choice, and do not restate the ones that die with the window:
   - **Why a streak needs a length above one.** Measured 2026-09-28, treating the sample as a derivation churned 125 of 163 entries between two idle runs while the answer changed zero times; and the 2026-10-03 episode where a 78%-idle recording moved two specs across `INTEGRATION_ABOVE_MS` and the gate demanded two renames. One contended run must not file a rename.
   - **Why the band had a floor as well as a fraction** — a fraction alone chases noise on a small number. The streak's analogue is that it counts runs and not magnitudes, which is the point to state.
   - **Why a measurement is not a derivation** (the three-kinds-of-recorded-artifact rule in root `CLAUDE.md`). The streak is still a sample; what changes is that its unit is machine-independent.
   Delete, with the window: the median-of-three argument, the length-two rule, `appendSample`, `disagrees`, `worthKeeping`, `COST_ACCURACY`, `nearEdge`, `provisional`, `CONTENTION_RATIO_MAX` and `ratiosFromMoves` — unless Open decision 1 lands on a basis that needs one, which Phase 3 settles.

7. **No threshold is widened to quiet a report.** `DRIFT_SHARE` in particular: correlated drift is the one failure nothing else detects, since a bump that adds a fifth to every entry sits under every per-entry tolerance by construction.

8. **Root `CLAUDE.md`'s "three kinds of recorded artifact" section is part of the work.** It names `spec-cost.json` as the only sample and describes the window as the shape to copy. Phase 4 rewrites that passage to describe what the record holds afterwards, including the sentence about a second sample.

## Open decisions (settle with the user before Phase 3)

1. **What `spec:dry`'s printed estimate is based on, once no millisecond is stored.** — *open*
   - **The last run's own durations.** The pool runner already has them (Decision 2) and could write them beside the streak as an unversioned cache. Free, always current, and honest about being one reading. Noisier than a median for a preview, and it reintroduces a per-machine number into the record unless it is kept out of git.
   - **Keep a cost for the preview only, with no band and no gate.** One reading per spec, overwritten every run, explicitly advisory. Smaller change, keeps the file's purpose mixed.
   - **Drop the estimate; print the plan and the record's age.** `spec:dry`'s value is mostly which specs would run; the time is a band nobody acts on. Deletes the most machinery, and loses a figure the command was built around.

   Whichever is chosen, `spec:dry` must keep printing what it cannot price (`priceSpecs`' `unpriced`/`outside` buckets), which root `CLAUDE.md` names as one of the four shapes for a partial result.

## Phases

### Phase 1 — Spike: does the suite run carry what the audit needs?

Throwaway work on a branch or worktree; nothing from it is reused verbatim. Answer four questions and report before Phase 2.

- **Does every spec appear with a duration in a real pool run?** Run `npm run test:unit` capturing output, apply `FILE_LINE` (`scripts/spec-cost.ts:63`) to it, and compare the files found against the twelve records' membership. Report any spec that runs but prints no parseable duration, and any that prints one only in a per-package run.
- **Is a JSON reporter available and better than the regex?** Check whether vitest's `--reporter=json` carries per-file durations for the pooled, multi-project runs the pool uses, and whether it can be added alongside the human reporter without changing what a developer sees.
- **What streak length is needed?** Using the durations captured above plus one deliberately contended run (`npm run measure -- --busy N` for the load), count how often a spec's verdict flips between runs. The streak threshold must be the smallest N where no spec flips N times running on noise.
- **How far is any spec from its edge?** List specs whose duration sits within one contended run's swing of `INTEGRATION_ABOVE_MS` or `FAST_BELOW_MS`. These are the only specs the streak has to protect, and the count sizes the whole design.

**Done when:** the four answers are in a "Spike results" section in this doc, with the commands and the machine; the streak threshold N is stated with the data behind it; and any spec the parse cannot see is named.

### Phase 2 — The record holds a streak

- New record shape in `scripts/lib/spec-cost.ts`: membership plus a per-spec streak. Keep `halfOfPath`, `halfFor`, `INTEGRATION_ABOVE_MS`, `FAST_BELOW_MS`, `unrecorded` and `PLACEMENT_GUARD`; delete what Decision 6 names.
- `packages/repo-checks/tests/suite-split.spec.ts` asserts on the streak: a spec is misfiled when its streak reaches N, and a streak below N is reported as provisional rather than acted on.
- Rewrite the twelve `packages/*/etc/spec-cost.json` files into the new shape. These are test expectations, not user data, so they are rewritten rather than migrated — but **not by hand**: the command writes them.

**Done when:** `npm test -w @app/repo-checks` passes; no record holds a millisecond or a `machine` field; `npm run spec -- spec-cost` passes. Mutation: set one spec's streak to N and `suite-split` names that spec; set it to N−1 and the run reports it as provisional and passes.

### Phase 3 — The suite run is the measurement

Needs Open decision 1 settled.

- `scripts/test-unit-pool.ts` parses the durations from the run it already performs and updates each spec's streak: reset to zero when the verdict agrees with the filename, increment when it does not.
- Delete `measure()`'s `spawnSync` of vitest from `scripts/spec-cost.ts`, and the flags and refusals Decision 3 names. What remains of `spec-cost:update` is whatever Open decision 1 requires; if nothing, the script becomes `spec-cost:check` alone and the npm scripts follow.
- Implement Open decision 1's choice for `spec:dry`.

**Done when:** `npm run test:unit` updates the streaks with no extra vitest process; `npm run spec:dry` prints a plan and whatever basis was chosen, including its `unpriced`/`outside` buckets; the audit passes on a box held deliberately busy, with no `--force`. Mutation: make one spec exceed its edge for N runs and watch `suite-split` turn red, then rename it and watch it go green.

### Phase 4 — The docs catch up

- Root `CLAUDE.md`: the "three kinds of recorded artifact" passage (Decision 8), the `spec-cost:check`/`spec-cost:update` entries in Commands, and the `check:idle` entry's claim about which commands refuse.
- `packages/abuddy-cli/CLAUDE.md`'s "Tests" section states the 2.5 s/1.5 s band and that `spec-cost:update` records a measured cost; `packages/repo-checks/CLAUDE.md` has the row for `suite-split`.
- Any doc naming a deleted flag.

**Done when:** `npm run spec -- doc-links` passes and `grep -rn "spec-cost:update -- --all\|RECORD_IDLE_FLOOR" docs/ packages/*/CLAUDE.md CLAUDE.md` finds nothing that describes the old behaviour. Docs outside `docs/archive/` describe the code as it is.

### Phase 5 — The chain's drift report, after it is the only caller

Deliberately last: the point is to re-derive the threshold for its actual sole consumer, which is only true once Phase 3 has removed the other one.

- Decision 4: re-measure `DRIFT_SHARE` against the chain's declared seconds, or record it as inherited with the reason. If re-measuring, use `npm run measure` and record runs, median and machine, as `measure.ts`'s existing table does.
- Decision 5: the top-mover exclusion and the three-branch remedy in `scripts/chain.ts`'s drift report.

**Done when:** `bodyDrift` has one caller; `npm run spec -- measure` and `npm run spec -- chain` pass; `npm run chain` is green. Mutation: feed the report a map where one step carries the whole movement and assert it names that step rather than the body, and a map where every step moved alike and assert it names the body — both as pure-function cases over two maps, which is the data-input shape root `CLAUDE.md` prescribes.

## Deferred

- **Per-suite drift thresholds derived from concentration.** Decision 5 answers the same question from the run's own data without a constant, and a threshold per suite is machinery for a number nobody reads directly.
- **The chain's own cost record.** It keeps declared `seconds` in `scripts/lib/chain-steps.ts` with `--record` writing them back, and has the same sample-versus-derivation question. Out of scope: this goal touches the chain only where deleting the spec-cost caller orphaned something.
- **Replacing the regex parse with a JSON reporter** beyond answering whether it is viable (Phase 1). If it is, it is a separate change with its own evidence.

## Constraints

- Commit each phase as it finishes, in logical chunks, no attribution lines, `git diff --cached` first; pushing, tagging and PRs are on request. Something outside the session stages files in this tree, so use `git commit -- <paths>`.
- No publishing, releases or triggered workflows.
- No real data dirs; no broad `pkill`/`killall`; E2E in the `abuddy-test` namespace with an isolated `ABUDDY_USER_DATA_DIR`.
- No bare `tsc` on `packages/preload`; no `npm install` in the example pack; no edits to version or release metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any`, the TypeScript floor, `api:update` after export changes.
- Investigate failing tests rather than loosening an assertion; mutation-check every new guard, and mutate a copy or a worktree rather than the shared tree.
- Measure on a quiet machine and record runs, median and machine with any number this goal adds (`npm run measure`, `npm run check:idle`).
- The spec-cost records are rewritten by the command that owns them, never by hand.
