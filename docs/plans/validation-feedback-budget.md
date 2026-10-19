# Restore fast validation

Status: proposed; implementation follows completion of the settings and pack contracts goal.
Date: 2026-10-19.

During the current goal's closeout, fix demonstrated blockers and retain timing evidence. Its
existing requirements and final strict gate remain unchanged.

## Goal and measurement

Target **3–4 minutes** for ordinary affected-change validation through `npm run chain`, with
**5 minutes** as the acceptance ceiling on an agreed reference machine. Compiler, platform and
other cross-cutting changes may select longer mandatory acceptance; explain that cost before running.

Choose representative host, pack, SDK and compiler changes before optimizing. SDK changes are not
assumed cheap: their dependency impact determines required work. Record machine, OS/runtime, core
budget, source revision and selected targets for each measurement.

Measure these conditions separately:

- **Cold test results:** dependencies installed, no reusable test verdicts. Include required fixture
  generation and builds; record whether build outputs were already available.
- **Warm incremental:** valid unchanged outputs and results available.
- **Exhaustive:** all required targets, bypassing verdict caches, with platform results identified.

Report dependency installation and remote queue/provisioning time separately. Do not use a cached
no-op or a change in machine size as proof of meeting the ordinary-change target. Retain repeated
measurements and variation. Report regressions initially; add hard performance gates only after
measurements are stable.

## Problem

The user reports an earlier chain duration near 150 seconds. Recent failed strict runs took roughly
29–34 minutes without reaching every stage. These are not controlled comparisons, but they expose
an unsustainable feedback loop.

Real compiler scenarios repeatedly capture installations, build packs, exercise watchers and native
loading, and verify archives. Broad package-level selection reaches many of them together. Fail-fast
retries repeat an expensive prefix while leaving later coverage unknown. Some scenario deadlines do
not accommodate their sequential operations; synchronous work can also block runner communication.

The repository already has a dependency graph, caches, timing reports, resource scheduling and
process owners. Extend those foundations. The objective is less necessary work on the ordinary path,
not simply larger deadlines or tests moved into another folder.

## Execution structure

### Vocabulary and ownership

| Term | Meaning |
|---|---|
| Unit | Tests an isolated owner's behavior |
| Integration | Tests collaboration between real components |
| Acceptance | Tests a supported workflow through public interfaces |
| Platform | Required environment, such as Windows, macOS or Linux |
| Target | An independently selectable group with declared prerequisites and execution bounds |

Name targets by stable responsibility, such as compiler behavior, native runtime or external
authoring. Test purpose does not determine resource needs: a parser check and an OS-loader probe
may both be integration tests while requiring different execution.

Keep three owners:

- Vitest/Playwright configuration owns test discovery.
- The chain owns target dependencies, selection, cache validity, resource reservations and process bounds.
- Tests own assertions and use existing fixture/lifecycle helpers.

Scripts and CI invoke these owners without competing file lists or selection policies. Reuse existing
config and graph checks to enforce complete discovery, no accidental duplicate execution within an
intended environment, required producer edges and reachability through exhaustive validation.

A test normally joins an existing target. A new target needs a distinct execution boundary; a helper
needs demonstrated duplication. Keep review guidance in prose rather than creating per-test metadata
or a naming linter. Apply settled names to changed boundaries without a repository-wide rename.

### Commands and selection

These are intended contracts; the affected-target selection below still needs implementation.

| Command | Guarantee |
|---|---|
| `npm run spec` | Focused development checks, retaining notices about uncovered build edges |
| `npm run chain` | Routine checks and all acceptance required by the selected change; valid results may be reused |
| `npm run chain -- --dry` | Explains comparison base, selected targets, prerequisites, platforms, cache decisions and expected cost |
| `npm run chain -- --strict --all --no-classify` | Exhaustive execution for the current environment, bypassing verdict caches |

Preserve `--all` as exhaustive and `--strict` as verdict policy. Platform guards remain intact.
Whole-product exhaustive acceptance requires the recorded results from all required environments;
a single machine's successful command cannot certify platforms it did not execute. Keep unavailable
or required-but-unexecuted coverage pending. Use existing platform workflows and VM procedures.

Separate **selection** from **cache validity**. Source impact determines required targets; current
input/output/environment records determine whether results can be reused. A cold verdict cache must
not select unrelated acceptance. Missing or modified required build output must still trigger its
producer and invalidate consumers.

Extend the existing input/dependency graph. Current package-level workspace/dependency inputs are
broad, so splitting configs alone may leave selection unchanged. Narrow ownership only where the
target's actual reads support it; retain dependency-read checks and conservative coverage for dynamic
inputs that cannot be bounded.

Pin and print the comparison base and head. Before integration, compare the full branch change
against the target branch's appropriate base, not only the last commit. Local selection also covers
staged, unstaged and relevant untracked inputs, deletions and renames. Missing bases or unclassified
relevant inputs expand coverage with an explanation. Do not promise five minutes for that fallback.

### Required validation boundaries

| When | Required checks |
|---|---|
| During implementation | Focused checks for changed behavior |
| Before integration | Routine checks plus affected acceptance |
| Before closing a substantial cross-cutting goal | Exhaustive acceptance on the converged committed candidate |
| Before release | Exhaustive acceptance and verification of the actual candidate packages/installers |
| Impact cannot be bounded confidently | Exhaustive acceptance, such as for broad toolchain or selection changes |

A compiler edit selects affected compiler/platform targets, not automatically unrelated app workflows.
Do not run exhaustive acceptance after every commit. An occasional manual full run can check selector
soundness; new schedules or automatic workflow triggers require separate authorization.

After failure, repair and validate the failed boundary before repeating broad execution. Reuse
unaffected evidence only where existing input and environment records establish validity. Relaxed
diagnostics never count as normal acceptance. A required uncached final gate still needs complete
execution after relevant repairs converge; assembling earlier focused passes does not replace it.

## Reduce execution cost

Keep ordinary behavior checks and representative real build/archive/app smoke coverage in the
routine path. Independently select exhaustive native/runtime matrices, repeated cold builds and
full external-authoring/lifecycle scenarios when their dependencies change or full acceptance runs.
An ordinary test becoming slow is a performance finding, not permission to relabel it.

Preserve each distinct behavioral guarantee. Account for existing cases, then consolidate redundant
executions where retained coverage proves the same claim. Use focused owner-level tests for branch
combinations and real public workflows to prove the owners connect. Mocks cannot replace actual OS
behavior claims.

Share verified immutable preparation through existing producers. Consumers must not regenerate shared
inputs. Give mutating consumers private copies and profiles. Keep fresh builds where capture,
independent installations, watcher replacement, corruption or cleanup is the assertion. Preserve exact
archive identity between author and app halves. No fixture service or new cache protocol is needed.

For every added full-build scenario, explain the new guarantee, why a smaller test is insufficient
and measured cost under stated conditions. Mark cost pending until measured; an allowance is not a
duration. Review this through existing reports and descriptions.

## Scheduling, deadlines and responsiveness

Reserve resources for nested compiler work through the existing scheduler. Measure before increasing
concurrency. Refresh obsolete cost estimates from completed runs; keep expected duration separate
from timeout allowances. Use existing reports rather than another timing store.

Bound expensive operations through existing process owners. Give sequential scenarios an enclosing
budget that accommodates their operations and awaited cleanup. Preserve short event/readiness waits.
Record phase timings and distinguish operation timeout, scenario timeout, reporting error and cleanup
failure. Timeout changes prevent premature termination; they do not reduce execution cost.

Investigate demonstrated runner blocking separately from slow execution. Use existing subprocess
boundaries for long toolchain work where the test permits it. Keep necessary in-process instrumentation
explicit. An outer timer cannot interrupt synchronous work; `setImmediate` between phases cannot make
that work responsive. Verify reporting and process exit as well as assertions. Avoid blanket increases,
retry-to-green, new worker frameworks and weakened reporting limits.

For incomplete diagnostics, record passed, failed, skipped and unstarted cases. Resume missing coverage
in bounded batches with required setup, rather than rerunning the expensive prefix. Diagnostic bounds
and collect-all execution are not normal acceptance policy.

## Implementation checkpoints

1. **Agree the execution map.** Reuse current evidence and complete only missing inventory. Produce:
   - A before/after selection table for representative host, pack, SDK and compiler changes, naming
     targets, prerequisites, platform obligations and expected critical path.
   - A build-reduction table naming repeated work, retained guarantees, removed execution and expected
     savings. Separate actual work reduction from narrower selection and cache reuse.
   Confirm the proposed map can meet the budget before moving files.
2. **Implement targets and selection.** Split mixed files along responsibilities using existing configs
   and runners. Extend the graph and discovery checks. Verify cold-cache selection, changed/deleted/
   untracked inputs, missing bases, shared dependencies and missing producer output. All required
   acceptance must remain reachable; uncertain impact must expand coverage visibly.
3. **Remove demonstrated waste and measure.** Share suitable preparation, consolidate redundant builds,
   correct resource/deadline ownership and fix demonstrated reporting problems. Validate affected
   boundaries first, then measure the agreed change scenarios. If the budget is missed, identify the
   remaining critical path rather than silently moving more tests out of routine execution.
4. **Prove coverage and finish.** Reconcile every retained or replaced guarantee and run exhaustive
   acceptance on committed source. Update CLAUDE.md, command help, configs and workflow guidance in
   the same checkpoints as their behavior changes. Remove replaced rules and record results before
   closing this plan.

No compiler redesign, new runner, cloud purchase, release or publication is authorized by this plan.

## Completion criteria

- Ordinary reference changes target 180–240 seconds and complete below 300 seconds under the stated
  cold-result conditions. Slower cross-cutting acceptance is required and explicitly reported.
- Before/after selection and build counts demonstrate less necessary work, not only regrouping,
  larger deadlines or cached no-ops.
- Every distinct guarantee has retained coverage; skipped and unavailable-platform cases are explicit.
  Structural checks protect discovery, selection and producer dependencies.
- Shared output preserves freshness, integrity, archive handoff and isolation. Lifecycle/cold-capture
  assertions still use fresh owned execution where needed.
- Expensive scenarios have bounded ownership, cancellation where supported, phase timings and awaited
  cleanup. Normal runs finish without unhandled reporting errors.
- Command guarantees and documentation agree. The
  [settings and pack contracts goal](../goals/goal-settings-and-pack-contracts.md) retains its existing
  requirements until explicitly reconciled; this plan waives none of its acceptance.

## References

[Bazel test definitions](https://bazel.build/versions/7.4.0/reference/be/common-definitions)
separate resource size from timeout. [Vitest projects](https://vitest.dev/guide/projects) provide native
grouping and discovery. Apply these principles within the installed tools; neither adopting Bazel nor
upgrading Vitest is implied.
