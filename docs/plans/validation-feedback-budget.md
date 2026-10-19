# Restore fast validation

Status: proposed; no implementation has started.
Date: 2026-10-19.

## Goal

Get ordinary changes through `npm run chain` in **3–4 minutes**, preferably below **5 minutes**,
on a recorded reference machine. Include required builds and preparation in that measurement.
Dependencies may already be installed; a cached no-op is not evidence of meeting the target.

Compiler or platform changes can require longer checks. Keep those checks mandatory and make their
cost clear before execution. Preserve exhaustive acceptance.

## Problem

The user reports an earlier full-chain duration near 150 seconds. Recent failed strict runs took
roughly 29–34 minutes without reaching every stage. Hardware, cache state and coverage differ, so
this is not a controlled performance comparison.

Expensive compiler scenarios now share a broadly selected integration pool. They repeatedly capture
installations, build packs, exercise watchers and native loading, and verify archives. Fail-fast runs
repeat successful work while leaving later tests unexecuted. Some multi-step scenarios also inherit
deadlines that do not fit their work.

The repository already has dependency selection, caching, duration reports, resource scheduling and
process cleanup. Improve the workload within that system before adding infrastructure.

## Design

### Use familiar names and clear owners

| Term | Meaning |
|---|---|
| Unit | Tests an isolated owner's behavior |
| Integration | Tests collaboration between real components |
| Acceptance | Tests a complete supported workflow through public interfaces |
| Platform | Required execution environment, such as Windows, macOS or Linux |
| Resources and timeout | Execution constraints, separate from test purpose |

Use these terms consistently in group names, commands and documentation. Do not add
"qualification" as another category alongside acceptance. Avoid speed-based group names such as
`fast`, `slow` or `heavy`, and temporary investigation names such as `native-tail`. Name groups by
their stable responsibility. Align changed classifications and their consumers in the same
checkpoint; this is not a separate repository-wide naming project.

Keep three owners:

- Test configuration owns file discovery through existing Vitest/Playwright configs.
- The chain owns prerequisites, outputs, selection, caching, resource reservations and process bounds.
- Tests own assertions and use existing fixture/lifecycle helpers.

Package scripts and CI invoke those owners. They must not maintain competing file lists, selection
rules or retry policies. Existing declarations remain authoritative; no new per-test registry.

Extend existing structural checks to reject undiscovered files, accidental duplicate discovery within
an environment, groups absent from exhaustive execution, missing producer dependencies and missing
execution requirements. Check representative source changes select the required acceptance groups.
Use existing config discovery and graph checks rather than building a general naming linter.

A new test normally joins an existing group. A new group needs a distinct execution boundary; a new
helper needs demonstrated duplication. These are review rules, not reasons to add more metadata.

### Separate ordinary integration from expensive acceptance

Use a few executable groups in the existing runner. Keep command, inputs, outputs, environment,
resource reservation and deadline together in the existing declarations. Do not add per-test labels
or a second classification system.

| Ordinary checks | Expensive acceptance |
|---|---|
| Types, lint, schema/API agreement | Native loader and runtime matrices |
| Settings, catalog, navigation and service behavior | Repeated cold capture/builds and watch recovery |
| Fast compiler parsing and bookkeeping | Real parent-loss, cancellation and replacement scenarios |
| Ordinary filesystem/process integration | Full external authoring and installed-app workflows |
| Representative real build/archive/app smoke coverage | Additional platform and lifecycle combinations |

Classify by what the test proves. Do not move an ordinary test merely because it is slow. Split mixed
files only along clear responsibilities, preserving their assertions and setup. Every existing case
must remain discoverable and have an execution home.

Keep the existing command meanings:

- `npm run spec`: focused development checks, with existing notices about uncovered build edges.
- `npm run chain`: checks required for the change, including affected expensive acceptance.
- `npm run chain -- --dry`: explain selected work, prerequisites and cache decisions.
- `npm run chain -- --strict --all --no-classify`: exhaustive acceptance; `--all` remains exhaustive.

A compiler change may therefore make `chain` take longer than five minutes. Do not advertise the
ordinary-change target as a universal guarantee. A missing required platform result stays pending;
a local pass must not imply that every platform passed.

Use the existing input/dependency graph to select groups. Verify required compiler, authoring and app
checks still run for relevant changes. Add selection machinery only when a concrete missed check or
unnecessary execution demonstrates the need. Do not start with a new merge-base engine, receipt store,
command family or platform orchestration layer.

### Remove repeated work

Share verified immutable fixture output through existing producer/consumer steps. Consumers must not
regenerate shared inputs. Missing or changed output must invalidate reuse; author/app halves must
consume the same verified archive.

Give mutating consumers private working copies and profiles. Keep fresh installations and builds
where independent capture, startup, watch replacement, corruption or cleanup is the assertion.
Do not create a fixture service or new cache protocol.

Use focused owner-level tests for combinations that do not need another complete public build.
Retain real CLI/app cases proving the owners connect correctly. Removing a redundant build requires
identifying the retained coverage; mocks cannot replace claims about actual OS behavior.

### Correct scheduling and deadlines

Reserve resources for nested compiler work through the existing scheduler. Avoid overlapping builds
that each assume the whole machine. Increase concurrency only after measuring the result.

Bound individual operations and give multi-step scenarios an explicit total allowance that fits their
operations and cleanup. Preserve short event/readiness waits and bounded teardown. Use existing
classes and process owners; do not build automatic deadline algebra or a workflow framework.

Record phase timings on expensive scenarios. Distinguish operation timeout, scenario timeout and
cleanup failure. A larger allowance prevents premature termination; it does not make execution faster.
Do not use blanket increases, retry-to-green or relaxed diagnostic limits as normal acceptance.

## Implementation order

1. **Separate the groups.** Reuse current logs and diagnostics. Make a small table of existing cases,
   proposed group and required trigger. Complete missing inventory in bounded batches without repeating
   the expensive completed prefix. Apply the vocabulary and ownership rules above, then move clearly
   expensive scenarios using existing configs and runners. Extend existing completeness checks.
2. **Remove demonstrated waste.** Share suitable preparation, retain necessary fresh scenarios, and
   correct resource/deadline ownership. Validate each changed boundary with focused checks.
3. **Measure and adjust.** Record machine, cores, source, cache state, preparation and total time for
   representative ordinary host/pack and shared SDK changes. Measure affected compiler changes
   separately. Fix only selection or performance gaps those results demonstrate. Report timing
   regressions first; do not introduce a noisy hard performance gate during this cleanup.
4. **Prove coverage and finish.** Account for every existing case, run exhaustive acceptance on
   committed source, and update CLAUDE.md, help, test configuration guidance and workflows together.
   Remove replaced rules. Record results and remaining limitations before closing this plan.

Use existing reports and runners throughout. No compiler redesign, new validation framework, larger
runner purchase or automatic CI schedule is required by this plan.

## Acceptance

- Representative ordinary changes meet the 3–4 minute target, preferably below 5 minutes, with
  dependencies installed and cold validation caches on the stated reference machine. Report repeated
  measurements and variation; do not hide required preparation or use no-op timings.
- Relevant changes select their required expensive groups. Exhaustive execution accounts for every
  existing test, with skips and unavailable platforms explicit.
- Group names describe test purpose; platform and execution constraints remain separate. Configs own
  discovery, the chain owns orchestration, and structural checks enforce complete, nonduplicated
  discovery within each environment. Scripts and CI do not duplicate those rules.
- Representative real build/archive/app coverage stays in the ordinary path. Moving exhaustive cases
  does not weaken their assertions or remove required execution.
- Shared preparation preserves integrity, freshness, archive handoff and test isolation.
- Scheduling and deadlines fit actual work; terminated or diagnostically relaxed runs cannot count as
  normal acceptance.
- Commands and documentation agree. The [settings and pack contracts goal](../goals/goal-settings-and-pack-contracts.md)
  keeps its existing requirements and final gate until an explicit migration checkpoint reconciles them.
  Writing this plan does not waive any current obligation.

## Reference

[Bazel test definitions](https://bazel.build/versions/7.4.0/reference/be/common-definitions)
distinguish resource size from timeout and define target timeouts over the tests they contain.
Apply that distinction within our runner; adopting Bazel is not proposed.

[Vitest projects](https://vitest.dev/guide/projects) provide native grouping and file discovery.
Use the installed version's supported configuration; no tool upgrade is implied by this plan.
