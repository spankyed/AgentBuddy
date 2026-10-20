# Restore fast validation

Status: proposed; implement after the settings and pack contracts goal completes.
Date: 2026-10-19.

During the current goal's closeout, repair demonstrated blockers and retain timing evidence. This
plan does not change that goal's required checks or final strict gate.

Before extending orchestration, complete the [Nx evaluation](nx-orchestration-evaluation.md). This
plan owns feedback budgets and coverage; that evaluation decides whether Nx or the existing runner
owns generic task execution. The typed custom configuration design below applies if the runner is
retained; adopting Nx requires reconciling it around Nx's native configuration, without dual inventories.

## Outcome and budgets

**An ordinary edit should reach a trustworthy integration verdict in 2–4 minutes on the developer's
existing computer, without skipping affected acceptance or hiding preparation.** Keep the daily
command simple: `npm run chain` selects the checks required for the change.

These are design budgets, not current performance claims:

| Measurement | Conditions and target |
|---|---|
| Warm incremental | Dependencies, unchanged builds and valid results available; aim near or below the previous 150-second baseline for actual ordinary edits |
| Cold test results | Dependencies installed, no reusable test verdicts; aim below 4 minutes, with 5 minutes as the acceptance ceiling; include all required generation and builds |
| Exhaustive | All required targets, bypassing verdict caches; measure a complete successful execution after reducing duplication, then set a separate budget |

Choose representative host, pack, SDK and compiler changes before optimizing. Cross-cutting changes,
including some SDK edits, may require longer acceptance. Show that selection and cost before execution;
a required remote result still pending means the integration verdict is incomplete.

Record machine, OS/runtime, core budget, source revision, selected targets and available build outputs.
Keep repeated measurements and variation. Report dependency installation and remote queue/provisioning
separately; do not exclude required preparation, use cached no-ops or change machines to claim success.
Preserve native-execution restrictions on the daily-use Mac. Report timing regressions initially;
introduce hard performance gates only after measurements stabilize.

## Problem

The user reports a historical full chain near 150 seconds. Recent failed strict attempts took roughly
29–34 minutes without reaching every stage. Those are not controlled comparisons, but the feedback
loop is plainly too expensive.

Broad package-level selection groups ordinary checks with repeated compiler capture, cold builds,
watch recovery, native loading and archive verification. Fail-fast retries repeat expensive successful
work while leaving later coverage unknown. Some enclosing deadlines do not fit sequential operations;
synchronous execution can also prevent runner updates.

Use the existing graph, caches, test tools, timing reports, scheduler and process owners. Success means
less necessary work on the ordinary path, not merely larger deadlines or renamed test groups.

## Design decisions

### 1. Group by responsibility, with clear ownership

Use familiar terms: **unit** tests cover an isolated owner, **integration** tests cover collaborating
components, and **acceptance** tests cover a supported workflow through public interfaces. A **target**
is an independently selectable group. Platform and resource needs are separate from test purpose.

Name targets by stable responsibility, such as compiler behavior, native runtime or external authoring.
A parser check and an OS-loader probe can both be integration tests without sharing prerequisites.

| Owner | Responsibility |
|---|---|
| Vitest/Playwright project | File discovery, resolution/environment, setup and test/hook defaults |
| Chain target and planner | Inputs/outputs, dependencies, selection, cache validity, resources and process deadline |
| Tests and existing helpers | Assertions, fixture ownership and scenario operation/cleanup bounds |

Scripts and CI invoke these owners without duplicate inventories or execution policies. Compatible
projects can share a worker pool; a selectable target does not require a separate process. Preserve
the existing source-versus-published-package resolution boundary.

Keep ordinary behavior checks and representative real build/archive/app smoke coverage in the routine
path. Independently select exhaustive native/runtime matrices, repeated cold builds and full external
authoring/lifecycle scenarios. A slow ordinary test needs investigation, not automatic relabeling.

### 2. Retain typed TypeScript authoring

Keep TypeScript records composed with existing helpers and native test projects. Source inspection
finds useful derivations already in `chain-steps.ts`: workspace dependency closures, typecheck targets
from `TYPECHECK_LEGS`, pool membership and fixture inventories. Expanded JSON would duplicate them;
JSON references would require a new configuration language. Authoritative JSON is therefore ruled out
for this work. Vitest 3.2 already supports the needed named projects.

The chain references each project without duplicating its test globs. A CLI pilot might separate
ordinary integration, compiler and native-runtime projects; create only boundaries justified by their
actual reads, prerequisites or execution requirements. Existing shell-based author/app workflows stay
in their producer/consumer form.

Extend the existing planning path to produce one resolved data model for execution and reporting:
selected targets, invocation/project references, inputs/outputs, dependency edges, selection reasons,
resources and deadlines. Keep execution callbacks out of target declarations and platform applicability
visible. Input freshness must still be checked when accepting results; a plan does not freeze disk.

JSON output is optional for an identified consumer, not another authored contract or required project.
An export must identify revision, comparison base and environment and distinguish declared targets
from collected/executed tests. Existing dry-run output may suffice.

Update discovery, selection, cache keys, timeout guards and reports together. Replace text-only checks
that force duplicate inventories with checks over resolved declarations where appropriate. Retain
source checks for source properties and dependency-read checks for input completeness. No arbitrary
TypeScript interpreter, naming linter or per-test registry is needed.

### 3. Select required targets before consulting result caches

These are intended command contracts; affected-target selection still needs implementation:

| Command | Guarantee |
|---|---|
| `npm run spec` | Focused checks, retaining notices about uncovered build edges |
| `npm run chain` | Routine checks plus all acceptance required by the selected change; valid results may be reused |
| `npm run chain -- --dry` | Explain comparison base, selected work, prerequisites, platforms, cache decisions and expected cost |
| `npm run chain -- --strict --all --no-classify` | Exhaustive execution for this environment, bypassing verdict caches |

Source impact selects required targets. Input/output/environment records determine whether selected
results can be reused. A cold verdict cache must not select unrelated acceptance. Missing or changed
required output must still select its producer and invalidate consumers.

Extend the existing graph rather than creating a parallel selector. Narrow broad package-level inputs
only when actual reads justify it. Trace source impact through producers to consumers, and retain
conservative coverage for dependencies that cannot be bounded.

Pin and print comparison base and head. Integration checks cover the full branch change against the
target branch's appropriate base, not only the last commit. Local selection includes staged, unstaged
and relevant untracked files, deletions and renames. Missing bases or unclassified relevant inputs
expand coverage visibly; the ordinary runtime target does not apply to that conservative fallback.

Whole-product exhaustive acceptance requires results from every required environment through existing
platform workflows and VM procedures. Keep `--all` exhaustive and `--strict` a verdict policy. A local
pass does not certify unexecuted platforms; required unavailable coverage stays pending.

### 4. Run exhaustive acceptance at deliberate boundaries

| When | Required validation |
|---|---|
| During implementation | Focused checks for changed behavior |
| Before integration | Routine checks plus affected acceptance |
| Closing a substantial cross-cutting goal | Exhaustive acceptance on the converged committed candidate |
| Before release | Exhaustive acceptance and verification of actual candidate packages/installers |
| Impact cannot be bounded confidently | Exhaustive acceptance, for example after broad toolchain or selector changes |

Compiler edits require affected compiler/platform targets, not automatically unrelated app workflows.
Do not run exhaustive acceptance after every commit. Occasional manual full execution can check
selection soundness; new automatic triggers or schedules need separate authorization.

After failure, validate the repaired boundary before another broad run. Reuse unaffected evidence only
when input and environment records establish validity. Relaxed diagnostics cannot count as acceptance.
Required uncached final gates still need complete execution after relevant repairs converge.

### 5. Reduce actual work and make expensive execution predictable

Preserve every distinct behavioral guarantee, not necessarily every redundant execution. Account for
existing cases and name their retained replacements when consolidating. Test branch combinations at
the responsible owner; retain real public workflows and OS execution for claims requiring them.

Share verified immutable preparation through existing producers. Consumers must not regenerate it.
Give mutating consumers private copies/profiles, and keep fresh execution for capture, independent
installations, watcher replacement, corruption and cleanup assertions. Preserve exact archive identity
between author and app halves. Do not create a fixture service or another cache protocol.

Reserve resources for nested compiler work through the existing scheduler. Measure before increasing
concurrency. Refresh stale duration estimates from completed runs, keeping expected cost separate from
timeout allowances and using existing reporting.

Bound expensive operations with existing process owners. Give multi-step scenarios enough total time
for their operations and awaited cleanup. Preserve short event/readiness waits. Record phase timings;
distinguish operation timeout, scenario timeout, reporting error and cleanup failure. Larger allowances
prevent premature termination but do not make execution faster.

Investigate runner blocking separately from slow execution. Use existing subprocess boundaries where
possible and keep necessary in-process instrumentation explicit. An outer timer cannot interrupt
synchronous work; `setImmediate` between phases cannot make that work responsive. Verify reporting and
exit status as well as assertions. Avoid blanket increases, retry-to-green and new worker frameworks.

Project defaults should fit their normal work. Reduce title-keyed timeout exceptions as recurring
patterns acquire a suitable project, retaining reviewed overrides for genuinely different scenarios.
Keep familiar filenames for discovery without deriving every prerequisite and resource limit from a
single integration suffix.

For incomplete diagnostics, report passed, failed, skipped and unstarted work. Resume missing coverage
in bounded batches with required setup rather than repeating the expensive prefix. Diagnostic limits
and collect-all execution do not automatically become normal acceptance policy.

A new test normally joins an existing target. A new target needs a distinct execution boundary; a new
helper needs demonstrated duplication. Added full-build scenarios must explain their new guarantee,
why a smaller test is insufficient and measured cost. Mark cost pending until measured. These are
review rules using existing reports, not new per-test metadata.

### Review findings this plan owns

The [PR 246 review](../evidence/pr-246-review.md) recorded four findings that are budget decisions, not
defects with one fix, and its acceptance runs surfaced a fifth (R-F1). They stay as they are until this plan resolves them:

| Finding | Current state | Resolve by |
|---|---|---|
| 10.1 | The `suite` rung is 600s (`scripts/lib/step-timeouts.ts`), double its earlier 300s. The reason recorded for raising it, the integration pool, now has its own `acceptance` class | Measure the remaining `suite` members, then set the rung from that measurement or return it to 300s. No change before then |
| 10.2 | `TIMEOUT_EXCEPTIONS` (`packages/repo-checks/tests/suite-timeouts.spec.ts`) holds 69 per-test overrides of 120–540s, many justified only by a run that hit the old limit | Apply "reduce title-keyed timeout exceptions" above: move recurring patterns to a fitting project, keep reviewed overrides for genuinely different scenarios |
| 10.7 | `test:external-pack:app` declares `seconds: 18` but now also runs the default-fork lifecycle (four app launches, four `apack pack` commands) | Refresh the declared cost from a completed run |
| R-F1 | A cold `apack pack build` of default-setup took 522s on the two-core hosted macOS runner (strict run `39430263642`) against a declared `seconds: 28`. Its finalization alone was 175s: compiler-input recording 125.4s and source validation 49.7s (diagnostic run `39427595920`). `build:default-setup` and `test:external-pack:fork` were moved from `suite` (600s) to `scenario` (900s) to fit it | Profile `compilation.finish()` and the final source checks on a cold build (`node --cpu-prof`), reduce that work, then return both steps to `suite` and refresh their declared cost. Keep the 900s classification until then |
| 3a.1 | `test:smoke` and `test:e2e` both declare `.apack/tests/results` as an output, and output digests are now part of a step's cache key, so any E2E run makes `test:smoke` stale with no input moved | Decide what a check step's declared outputs mean for cache validity, in the chain target and planner, rather than special-casing one step |

## Implementation checkpoints

1. **Map execution before moving tests.** Reuse current evidence and complete only missing inventory.
   Produce two small tables:
   - Before/after selection for representative host, pack, SDK and compiler changes: targets,
     prerequisites, platforms and expected critical path.
   - Build reduction: repeated work, retained guarantees, removed execution and expected savings.
   Separate work reduction from narrower selection and cache reuse. Establish a credible budget path.
2. **Prove one CLI boundary.** Separate ordinary CLI integration from real compiler scenarios using
   native projects and the existing typed planner. Prove discovery, resolution, prerequisites and
   meaningful selection/preparation savings. If both still require the same expensive work, fix
   ownership before expanding. Exercise cold caches, changed/deleted/untracked inputs, shared
   dependencies, missing bases and missing producer output.
3. **Expand and reduce waste.** Apply the proven pattern only where needed. Consolidate redundant
   builds, share suitable preparation and correct execution/reporting ownership. Validate affected
   boundaries first, then measure the agreed change scenarios. A missed budget requires identifying
   the remaining critical path, not silently excluding required work.
4. **Accept and document.** Reconcile retained/replaced guarantees and run exhaustive acceptance on
   committed source. Update CLAUDE.md, command help, configs and workflow guidance alongside behavior
   changes; remove replaced rules. Record exact source, platform evidence, runtime results and remaining
   limitations before closing this plan.

No compiler redesign, new runner, cloud purchase, release or publication is authorized by this plan.

## Completion criteria

- Ordinary edits meet the stated warm/cold-result budgets on the existing computer, including required
  preparation. Longer cross-cutting acceptance and pending remote obligations remain explicit.
- Selection and build counts show less necessary work, not merely regrouping, larger deadlines or
  cached no-ops. Exhaustive duration has its own measured budget.
- Every distinct guarantee has retained coverage. Existing structural checks protect discovery,
  accidental duplicate execution, project references, exhaustive reachability and producer dependencies.
- Typed declarations remain authoritative; execution and reporting consume one resolved plan.
  Native project configs own discovery, resolution boundaries and worker budgets remain correct,
  and dependency-read checks still protect input completeness.
- Shared preparation preserves integrity, freshness, isolation and exact archive handoff. Tests of
  cold capture and lifetime still own fresh execution where necessary.
- Expensive scenarios retain bounded operations, cancellation where supported, phase timings and
  awaited cleanup. Normal acceptance has no unhandled reporting errors.
- Commands and documentation agree. The
  [completed settings and pack contracts goal](../archive/goals/goal-settings-and-pack-contracts.md#outcome-2026-10-19)
  records its final acceptance decision; this separate plan does not reopen that delivery or waive
  other goals' validation requirements.

## References

[Bazel test definitions](https://bazel.build/versions/7.4.0/reference/be/common-definitions) separate
resource size from timeout. [Vitest v3 projects](https://v3.vitest.dev/guide/projects) provide native
grouping and discovery. Apply these principles within the installed tools; no tool migration is implied.
