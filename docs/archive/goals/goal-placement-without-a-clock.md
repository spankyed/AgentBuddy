> **Done** (branch `AS/spec-placement-without-milliseconds`). Both spikes concluded and the
> recommendation is to build neither option. The text below is the plan as written; the Outcome
> records the answers and the defect the spikes found instead.
>
> **Written in session** `f122fdc5-84c9-467f-9c61-66330eab32d0` (Claude Code, 2026-10-05). Resume it with `claude -r f122fdc5-84c9-467f-9c61-66330eab32d0`.

```
# Goal: can the spec-placement audit stop depending on a clock?

Implement docs/goals/goal-placement-without-a-clock.md on AS/spec-placement-without-milliseconds, at
or after 64441bff8 — where the prior goal's Spike results live, which this one builds on. It holds
equally at master once that branch merges.
Before Phase 1, confirm the base: docs/archive/goals/goal-spec-placement-without-milliseconds.md
exists and has a "Spike results" section. If it doesn't, stop and say so.
Read Background, Decisions, Phases and Constraints first. Decisions are final.

**This goal implements no design.** Both phases are spikes; the deliverable is evidence and one
recommendation. Nothing in scripts/ or packages/ changes except throwaway probes, which are deleted.
That is the correction from the goal this one follows: its design was written up and kicked off
before it was spiked, and the spike then disproved it.

Phase 1 and Phase 2 can be answered largely from data the prior spike already captured. If a
question needs a fresh run, take it on a box at or above 85% idle (npm run check:idle) and record the
conditions. Load is induced with CPU burners started and stopped by captured PID, never pkill.

Finished when:
- Phases 1-2 each meet their "Done when", with numbers, commands and the machine recorded.
- A "Spike results" section in this doc answers both questions, and states for each option whether
  it is viable, dead, or needs a measurement named in the doc.
- One recommendation, in one paragraph: which option to build, or neither, and what it costs.
- No change under scripts/ or packages/ (git status clean there); probes deleted.
- A final summary: phase -> done/deferred, evidence, conventional choices.
- The doc is in docs/archive/goals/, with its status blockquote and an Outcome section, committed.

Commit as you go: one commit per phase, conventional message, no Co-Authored-By or session lines,
`git commit -- <paths>` naming only that phase's files; check `git diff --cached` first.
Don't push, tag, or open a PR unless the user asks.

Never:
- the standing prohibitions in Constraints below.
- write a design document, edit a constant, or start an implementation for either option before the
  recommendation is written. A spike that turns into the change it was meant to evaluate is how the
  previous goal failed.
- report a ratio or a verdict from a single run as a result. Both questions are about stability
  across runs, so any claim needs at least two.
```

## Background (2026-10-05, at `64441bff8` on `AS/spec-placement-without-milliseconds`)

`packages/*/etc/spec-cost.json` records what each spec costs so that `suite-split.spec.ts` can ask whether a spec sits in the half its filename declares. The edges are absolute: `INTEGRATION_ABOVE_MS` 2500, `FAST_BELOW_MS` 1000 (`scripts/lib/spec-cost.ts`).

[`goal-spec-placement-without-milliseconds.md`](goal-spec-placement-without-milliseconds.md) tried to replace the stored millisecond with a machine-independent verdict and failed. Its Spike results hold the measurements; the short version is that the verdict is as machine-dependent as the millisecond, because the edge is wall-clock. Under load at 20% idle, three specs crossed an edge in **both** of two runs, so no consecutive-count threshold helps. Two repairs were ruled out there too: a margin wide enough to cover load (3.3x) is blind to the 31 of 415 specs that sit within one swing of an edge, and per-run normalisation fails because load is not a uniform multiplier — after dividing by the median 1.18x, 20 of 83 specs were still more than 1.5x out, with larger specs less affected (1.10x) than smaller (1.23x).

Two options were named there and neither was measured. This goal measures them.

A third was closed by prior evidence and is **out of scope**: deciding the half by mechanism (does the spec spawn a compiler, open a database). Root `CLAUDE.md` records "cost rather than spawning, because spawning was only ever a proxy", with three counterexamples.

Data already captured by the prior spike, reusable here: per-file durations for 415 specs on a quiet box across all three pools, and two runs of the root projects at 20% idle. The commands that produced them are in that doc's Spike results.

## Decisions

Final.

1. **This goal produces evidence and one recommendation, and implements neither option.** The prior goal's failure was committing to a design before spiking it.
2. **Both options are judged on the same two criteria**, so the comparison means something: does it place specs the same way on a quiet box and a loaded one, and does it keep the sensitivity the absolute edge has — the 31 specs within a swing of an edge are the population that matters, not the 384 that no noise can move.
3. **A recommendation of "neither, keep what is there" is a success.** The current design is correct for a machine-dependent question; the prior goal established that. This goal is asking whether the question can stop being machine-dependent, and "no" is an answer worth having recorded once rather than re-derived.

## Spike results (2026-10-05)

Machine: Apple M1 Pro, 10 cores. No fresh runs were needed: this reuses the three runs the prior goal captured — one quiet at 88-94% idle and two at 20% idle, induced with eight `node` CPU burners started and stopped by captured PID. Their commands are in [that doc's Spike results](goal-spec-placement-without-milliseconds.md). 288 specs are measured in all three; the pack pool was not re-run under load, so `@app/default-setup`'s specs are outside this analysis.

Probe: a throwaway Python script over the captured JSON, deleted. Every number below is from three runs, never one.

### Phase 1 — Calibrate within the run: **halves the noise, leaves the failure**

At-risk population — within a 2.5x swing of an edge, the only specs any of this can move — is **23 of 288**.

Baseline, the absolute edge as it works today: **9 of 23** changed verdict under load, **3 in both** loaded runs.

Two reference sets, each fixed by name from the quiet run and re-measured in every run, so the choice is a rule rather than a lookup:

| reference | quiet | busy 1 | busy 2 | verdict changed | in both runs |
|---|---|---|---|---|---|
| absolute edge (baseline) | — | — | — | 9 of 23 | **3** |
| A: median of all 288 specs | 18 ms | 18 ms | 19 ms | 9 of 23 | **5** |
| B: median of the 19 specs in the 1000-3000 ms band | 1532 ms | 2253 ms | 2002 ms | **5 of 23** | **3** |

**Reference A is useless, and instructively so.** The median spec in the suite is 18 ms, and it does not feel load at all — 0.96x and 1.01x against the quiet run while the band moved 1.47x and 1.31x. Dividing a two-second spec by an 18-millisecond one corrects nothing and it made the sustained case worse (5 in both against the baseline's 3). This is the prior goal's "load is not a uniform multiplier" showing up as a design constraint: a reference has to be similar in kind to what it judges, and "the run's median" is not.

**Reference B is the one that works, as far as it goes.** It halves transient flips, 9 down to 5. But **the "in both runs" column is unchanged at 3** — and that column is the whole problem. A flip in one run is absorbed by any repetition rule; a flip that repeats under sustained load is what defeated the streak in the prior goal, and calibration leaves it exactly where it was. So this option fixes the half that was never broken.

**Verdict: viable but not worth building.** It is a real improvement to a quantity nothing acts on — the transient flip was already absorbed by the window — and it does not move the number that matters. What would change this: a reference whose own load response tracks the judged spec's closely enough to collapse the "in both" count, which would need the reference chosen per spec rather than per run. Not measured; a bigger design than the one this goal was asked about.

### Phase 2 — Stop storing anything: **dead as a gate, and it found the real defect**

Flag a spec that blew its budget *in that run*; no record, no window, no machine field, no idle floor. Flags per run, split by whether the package has a second half to move a spec into (`hasSplit`):

| run | flags | in split packages (a rename is available) | in single-config packages (nowhere to move) | false vs the record |
|---|---|---|---|---|
| quiet | 6 | 2 | 4 | 2 |
| busy 1 | 10 | 6 | 4 | 6 |
| busy 2 | 10 | 7 | 3 | 7 |

The record reports **zero** misplacements — `spec-cost:check` passes — so every split-package flag is false against it. That is 20-70% of the flags in a run, and **2 even on a quiet box**. As a gate this is unusable: it would demand renames on most runs and a different set each time.

**What the three-run intersection found is the valuable part.** Four specs are flagged in *all three* runs:

| spec | quiet | busy 1 | busy 2 | record says | kind |
|---|---|---|---|---|---|
| `apack-cli/tests/commands/run-install.spec.ts` | 3163 | 3106 | 3297 | **1317** | split — a rename is available |
| `apack-host/tests/build/published-manifest.spec.ts` | 2838 | 3600 | 3202 | 3652 | single-config, `outgrown` |
| `apack-host/tests/database/write-lock.spec.ts` | 4890 | 4812 | 4769 | 4695 | single-config, `outgrown` |
| `apack-sdk/tests/build/generate-entries.spec.ts` | 17745 | 31448 | 31067 | 11308 | single-config, `outgrown` |

Three are `outgrown` — a single-config package has nowhere to move a spec, so the entry records what makes it expensive and no rename is implied. The fourth is a finding.

**`run-install.spec.ts` is recorded at 1317 ms and reads 3106-3297 ms in every run, quiet and loaded alike.** It is in the fast half of a package that *has* an integration half, so a rename is available, and the audit passes anyway — because the record's 1317 ms was measured by `measure()` running one vitest **per package**, while the spec actually runs pooled across eleven projects. The audit is passing on a number from an environment the spec does not run in. That is the pooled-versus-per-package gap the prior goal listed as an open item, with a named victim and a 2.4x discrepancy.

**Verdict: dead.** Not because the signal is absent — the three-run intersection is almost all real — but because a run-local flag with a 20-70% false rate cannot gate anything, and acting on agreement across runs is the streak that the prior goal already disproved under sustained load.

## Recommendation

**Build neither, and fix the measurement context instead.** Both options were asked whether the audit can stop depending on a clock, and the answer is no: calibration improves only the transient flips that the window already absorbs and leaves the sustained-load failure at exactly 3 of 23, while a run-local flag is 20-70% false and cannot gate. The millisecond, the window, the band and the idle floor remain correct for a question that is irreducibly about wall-clock time. What these two spikes did find is a defect neither option would have fixed: the record measures each spec in a per-package vitest while specs run pooled, so `run-install.spec.ts` is recorded at 1317 ms against a pooled 3106-3297 ms and is arguably misfiled in the only environment that matters. Fixing that means measuring in the pool, which the prior spike already established is cheap — vitest's JSON reporter carries per-file durations on a pooled multi-project run and sits alongside the human reporter unchanged. That is a contained change to where `measure()` gets its numbers, it keeps every protection the current design has, and it is the one thing here with a named victim rather than a hypothetical one.


## Phases

### Phase 1 — Calibrate within the run

Judge a spec against a reference measured in the *same* run rather than against an absolute edge, so load cancels in a ratio. The prior spike's finding that load is not uniform is the thing to work around: a reference has to be similar in kind to what it judges.

- From the captured runs, compute each spec's ratio to one or more candidate references, and ask whether a ratio-edge places the 31 at-risk specs the same way quiet and loaded.
- Try at least two reference choices and say which, if either, is stable: the run's median spec, and a designated calibration spec of similar kind to the at-risk population.
- Report the misplacement rate for each choice against the current record's placement as the baseline.

**Done when:** the doc states, per reference choice, the quiet-vs-loaded placement agreement over the at-risk specs, and whether any choice is stable enough to replace the absolute edge. A choice that needs a fresh measurement names it rather than guessing.

### Phase 2 — Stop storing anything

Have the pool report a spec that blew its budget *in that run*, with no record, no window, no machine field and no idle floor. `suite-split` stops being a gate; one flag is not actionable.

- From the three captured runs, count flags per run and how many correspond to a spec the current record also considers misplaced or outgrown.
- Report the false-flag rate on a quiet run and on a loaded one. A report nobody can act on is the failure mode to measure for.
- Say what is lost: the gate, and whatever `spec:dry` reads today.

**Done when:** the doc states the flag count and false-flag rate for a quiet and a loaded run, and what a reader would do with the output. Whether losing the gate is acceptable is named as a question for the user, not decided here.

## Outcome (2026-10-05)

Both phases answered from the three runs the prior goal captured, so no fresh measurement was needed and nothing under `scripts/` or `packages/` changed. **The answer to the goal's question is no**, which Decision 3 named as a success: calibrating within the run improves only the flips the window already absorbs and leaves the sustained-load failure at 3 of 23, and a run-local flag is 20-70% false against the record and cannot gate. The clock is not removable, because the budget it audits is wall-clock. What the spikes did turn up is a defect neither option addressed: the record measures each spec in a per-package vitest while specs run pooled, and `apack-cli/tests/commands/run-install.spec.ts` is recorded at 1317 ms against a pooled 3106-3297 ms in all three runs — in a split package, so a rename is available, with the audit passing regardless.

### Per phase

| Phase | Status | Evidence |
|---|---|---|
| 1 — Calibrate within the run | **done — viable, not worth building** | `4a5cc84f0`. Band reference halves transient flips (9 of 23 -> 5) and leaves "in both runs" at 3 |
| 2 — Stop storing anything | **done — dead** | `63948e48d`. 6/10/10 flags per run, 2/6/7 false against a record reporting zero |

### Conventional choices

- Reference sets for Phase 1 were fixed **by name** from the quiet run and re-measured in each run, so a choice is a rule rather than a post-hoc lookup. Picking the most stable reference after the fact would have been overfitting to three runs.
- The at-risk population is 23 here against the prior goal's 31, because `@app/default-setup`'s specs are in the pack pool, which was never re-run under load. Said rather than silently narrowed.
- Both phases' numbers come from one probe over one dataset, but they are committed separately because they answer separate questions.

### Open items

- ~~**The recommendation**: move `measure()`'s numbers to the pooled run via vitest's JSON reporter.~~ **Done 2026-10-06, and the reporter is not the `json` one.** Verified against vitest 3.2.4: `json` carries **no per-file duration** — only a span between a module's first and last *test*, which excludes file-level hooks and collection, measured 0.5–42ms low per file and ~30% low on a small one — and **no project name anywhere**. `junit` carries the exact duration but still no project name. A custom `onTestRunEnd` reporter carries all three, and `diagnostic().duration` is the identical field the console prints: verified equal for 12 of 12 files in one run. `scripts/lib/spec-durations-reporter.ts` is it, on the pattern `spec-count-reporter.ts` already established (hooks pinned with `satisfies keyof Reporter`, so a vitest upgrade is a compile error; destination from the environment; prints nothing). It also closed a hole no output-based answer could: a project that ran *zero files* appears in no reporter's output, so `projectsThatDidNotRun` could only ever answer for a multi-project run — it names every project the run started now.
- `run-install.spec.ts` may genuinely belong in `@apack/cli`'s integration half. Worth confirming once the measurement context is fixed, since that is what would decide it.
- A per-spec reference, rather than a per-run one, is the only version of Phase 1 that could collapse the "in both runs" count. Unmeasured, and a larger design than this goal asked about.

## What was given up, and what turned out not to be a loss (2026-10-06)

A review of the deletion named four losses. One was real and is closed; one dissolves on reading the repo's
own rules; two stand.

- **A spec no config collects** was the real one, and it was reachable: every config's include is `tests/**`,
  so a spec in `src/` is matched by nothing — planted one and vitest collected 0 files. The deleted
  `suite-split.spec.ts` caught it as a side effect of recording every spec's cost ("records every spec, so a
  new one cannot be placed by accident"). `spec-placement.spec.ts` now asks it directly, with the included
  and excluded roots read off the configs rather than restating the `tests/` convention.
- **"CI has no baseline" is not a loss.** The committed records could have been compared against by a
  runner, but a runner must never compare against them: *"CI may fail a check, never a clock. A runner is
  smaller and noisier than any developer's box, so anything gating on wall-clock there manufactures flakes
  that read as code failures."* The door being shut is the policy, so there is nothing to recover.
- **No per-spec cost history across machines or clones**, and that stands. What replaced it is a ten-run
  window inside the uncommitted cache, which answers "has this crept" on one box and informs one column.
  The measured size of what nothing watches: 349 of 388 fast-half files are under 500ms and total 24.1s, so
  each could double without entering any top five — but correlated creep across many specs is what the
  chain's step-level `seconds` drift already reports, and a single spec that grows enters the ranking by
  definition. The gap is ~15 mid-size specs, worth a second or two on a 109s half.
- **Placement is reported rather than enforced**, and that stands too, deliberately: the enforcement given
  up was demanding moves the other pool's reading demanded back. What is new is that the report now says
  whether a half is getting heavy rather than only which file is worst, and that it reaches the two commands
  anyone runs.

## Constraints

- The standing set: no push/tag/PR unless asked; no publishing, releases or triggered workflows; no real data dirs; no broad process kills (CPU burners stopped by captured PID); no bare `tsc` on `packages/preload`; no edits to version or release metadata; typed EARS types are change-controlled; investigate a failure rather than loosening a check.
- Measure on a box at or above 85% idle for anything recorded, and record runs, median and machine (`npm run measure`, `npm run check:idle`). Two runs minimum for any stability claim.
- Probes live in the session scratchpad and are deleted; nothing under `scripts/` or `packages/` changes.
