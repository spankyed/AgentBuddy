# Integration deadline inventory

Status: complete failure inventory across all 68 source files; setup-blocked cases remain unverified.
Inventoried source `27e9e4109`; inventory checkpoint `89898080c`. No further normal integration or strict run until the
classification, composition repair and affected checks below converge.

## Failure classification before further execution

Diagnostic [39210359774](https://github.com/spankyed/AgentBuddy/actions/runs/39210359774),
isolated `4d4014241`, stops after 1,202.034 seconds. Its console is preserved locally at
`/private/tmp/apack-integration-coverage-39210359774.log` and in the run’s retained output.

| Category | Observed failure | Disposition |
|---|---|---|
| Whole-scenario timeout | Complete pool exceeds its private 1,200s bound | Primary failure. Eight files pass; one Windows-only file skips. The remaining 59 files are unproven. The normal 600s aggregate is also insufficient: the completed native file alone takes 906.983s. |
| Assertion failure | Diagnostic driver expects exit 0 but receives timeout exit 124 | Consequence of the aggregate timeout, not a failed product assertion. No test assertion failure is reported in the completed files. |
| Individual-operation timeout | None reported in this diagnostic | Expected native-load refusals on stderr belong to passing negative tests; do not count them as failures. |
| Cleanup failure | None reported in this diagnostic | Completed owner/cleanup assertions pass. Interrupted or unexecuted work is not certified by that result. |

The JSON reporter writes at normal completion, so termination leaves no complete JSON report.
Do not describe this as an all-files pass or a complete failure inventory. Exactly **495 actual tests**
pass in the completed eight files; 26 Windows-only cases skip.

Earlier normal-run exit-handler failure `39207375977` is a **whole-scenario timeout** at 60s.
The complete worker control `39209331600` passes all 16 cases; the exit-mutation refusal takes
22.030s alone. The complete-coverage control also passes that case. Its earlier slowdown remains
unattributed; no runtime assertion or cleanup defect has been demonstrated.

## Composition findings to repair in one pass

- Electron authoring/build/archive: four existing command limits total 360s (60 + 60 + 180 + 60),
  exceeding the 300s outer case before verification and disposal. Preserve each command limit.
- Public build cancellation: startup allows 60s, shutdown 20s and final cleanup 20s, while the outer
  case inherits 60s. Give the sequence an enclosing budget without enlarging startup or cleanup.
- Native search/override/suffix cases and staged/publication cases perform multiple builds and
  verification/disposal steps under one default or fixed scenario limit. Audit the declared operations,
  including refused attempts, rather than multiplying the latest elapsed duration.
- Keep existing event waits, native-loader helper limits and cleanup bounds. A larger enclosing
  budget does not authorize a larger bound on a stuck operation. Identify missing operation ownership
  explicitly; do not replace it with an unbounded promise race or expand into a generic test framework.
- The full pool needs a separate aggregate budget appropriate to its complete bounded workload.
  Do not widen all unit/compiler/test defaults to compensate for this one acceptance pool.

## Per-file execution coverage

An authored `it.each` body represents several runtime cases. The source inventory is used to inspect
operations and declarations; completed console case counts are the execution evidence.

| File | Current execution evidence | Remaining batch |
|---|---|---|
| [packages/apack-cli/tests/build/build-output-swap.integration.spec.ts](../../packages/apack-cli/tests/build/build-output-swap.integration.spec.ts) | 12 passed, 2 failed, 0 pending; 561.752s. | 1 |
| [packages/apack-cli/tests/build/build-registry.integration.spec.ts](../../packages/apack-cli/tests/build/build-registry.integration.spec.ts) | 1 passed, 1 failed, 0 pending; 82.811s. | 4 |
| [packages/apack-cli/tests/build/build-worker.integration.spec.ts](../../packages/apack-cli/tests/build/build-worker.integration.spec.ts) | 16 passed; 574.740s. | — |
| [packages/apack-cli/tests/build/compilation-inputs.integration.spec.ts](../../packages/apack-cli/tests/build/compilation-inputs.integration.spec.ts) | 6 passed, 3 failed, 0 pending; 90.714s. | 6 |
| [packages/apack-cli/tests/build/compiler-configuration.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-configuration.integration.spec.ts) | 1 passed, 0 failed, 0 pending; 31.078s. | 1 |
| [packages/apack-cli/tests/build/compiler-elf-libraries.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-elf-libraries.integration.spec.ts) | 0 passed, 0 failed, 0 pending; 0.000s. | 4 |
| [packages/apack-cli/tests/build/compiler-esbuild-configuration.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-esbuild-configuration.integration.spec.ts) | 15 passed; 232.409s. | — |
| [packages/apack-cli/tests/build/compiler-file-reads.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-file-reads.integration.spec.ts) | 12 passed; 243.862s. | — |
| [packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts) | 25 passed; 906.983s. | — |
| [packages/apack-cli/tests/build/compiler-pe-libraries.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-pe-libraries.integration.spec.ts) | 26 Windows-only cases skipped; retain the owning goal’s Windows evidence. | — |
| [packages/apack-cli/tests/build/declaration-aliases.integration.spec.ts](../../packages/apack-cli/tests/build/declaration-aliases.integration.spec.ts) | 2 passed, 0 failed, 0 pending; 1.592s. | 2 |
| [packages/apack-cli/tests/build/dependency-flow-helpers.integration.spec.ts](../../packages/apack-cli/tests/build/dependency-flow-helpers.integration.spec.ts) | 3 passed, 0 failed, 0 pending; 3.631s. | 2 |
| [packages/apack-cli/tests/build/dependency-graph.integration.spec.ts](../../packages/apack-cli/tests/build/dependency-graph.integration.spec.ts) | 0 passed, 0 failed, 0 pending; 0.000s. | 1 |
| [packages/apack-cli/tests/build/dependency-inputs.integration.spec.ts](../../packages/apack-cli/tests/build/dependency-inputs.integration.spec.ts) | 0 passed, 1 failed, 0 pending; 71.279s. | 2 |
| [packages/apack-cli/tests/build/dsl-defs.integration.spec.ts](../../packages/apack-cli/tests/build/dsl-defs.integration.spec.ts) | 6 passed, 0 failed, 0 pending; 5.138s. | 1 |
| [packages/apack-cli/tests/build/dsl-snapshot.integration.spec.ts](../../packages/apack-cli/tests/build/dsl-snapshot.integration.spec.ts) | 1 passed, 0 failed, 0 pending; 50.806s. | 6 |
| [packages/apack-cli/tests/build/editor-declarations.integration.spec.ts](../../packages/apack-cli/tests/build/editor-declarations.integration.spec.ts) | 0 passed, 1 failed, 0 pending; 60.067s. | 4 |
| [packages/apack-cli/tests/build/facade-gate-system-contract.integration.spec.ts](../../packages/apack-cli/tests/build/facade-gate-system-contract.integration.spec.ts) | 2 passed, 0 failed, 0 pending; 6.533s. | 6 |
| [packages/apack-cli/tests/build/facade-gate.integration.spec.ts](../../packages/apack-cli/tests/build/facade-gate.integration.spec.ts) | 5 passed, 0 failed, 0 pending; 10.598s. | 6 |
| [packages/apack-cli/tests/build/facade-type-data.integration.spec.ts](../../packages/apack-cli/tests/build/facade-type-data.integration.spec.ts) | 0 passed, 0 failed, 0 pending; 0.000s. | 3 |
| [packages/apack-cli/tests/build/facade-typing-published.integration.spec.ts](../../packages/apack-cli/tests/build/facade-typing-published.integration.spec.ts) | 0 passed, 0 failed, 0 pending; 0.000s. | 3 |
| [packages/apack-cli/tests/build/facade-typing.integration.spec.ts](../../packages/apack-cli/tests/build/facade-typing.integration.spec.ts) | 0 passed, 0 failed, 0 pending; 0.000s. | 1 |
| [packages/apack-cli/tests/build/fe-bundler-dev-server.integration.spec.ts](../../packages/apack-cli/tests/build/fe-bundler-dev-server.integration.spec.ts) | 2 passed, 0 failed, 0 pending; 0.094s. | 5 |
| [packages/apack-cli/tests/build/fe-bundler-host-registry.integration.spec.ts](../../packages/apack-cli/tests/build/fe-bundler-host-registry.integration.spec.ts) | 20 passed, 0 failed, 0 pending; 27.754s. | 4 |
| [packages/apack-cli/tests/build/fe-bundler-opaque-deps.integration.spec.ts](../../packages/apack-cli/tests/build/fe-bundler-opaque-deps.integration.spec.ts) | 3 passed, 0 failed, 0 pending; 0.534s. | 6 |
| [packages/apack-cli/tests/build/frontend-generation.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-generation.integration.spec.ts) | 0 passed, 1 failed, 0 pending; 125.561s. | 5 |
| [packages/apack-cli/tests/build/frontend-globs.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-globs.integration.spec.ts) | 7 passed, 0 failed, 0 pending; 6.573s. | 6 |
| [packages/apack-cli/tests/build/frontend-outputs.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-outputs.integration.spec.ts) | 1 passed, 0 failed, 0 pending; 0.646s. | 2 |
| [packages/apack-cli/tests/build/frontend-resources.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-resources.integration.spec.ts) | 6 passed, 5 failed, 0 pending; 354.313s. | 3 |
| [packages/apack-cli/tests/build/frontend-workers.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-workers.integration.spec.ts) | 3 passed, 1 failed, 0 pending; 88.360s. | 2 |
| [packages/apack-cli/tests/build/own-declarations.integration.spec.ts](../../packages/apack-cli/tests/build/own-declarations.integration.spec.ts) | 1 passed, 0 failed, 0 pending; 42.247s. | 2 |
| [packages/apack-cli/tests/build/package-inputs.integration.spec.ts](../../packages/apack-cli/tests/build/package-inputs.integration.spec.ts) | 5 passed, 4 failed, 0 pending; 290.747s. | 4 |
| [packages/apack-cli/tests/build/staged-dsl.integration.spec.ts](../../packages/apack-cli/tests/build/staged-dsl.integration.spec.ts) | 0 passed, 1 failed, 0 pending; 146.979s. | 5 |
| [packages/apack-cli/tests/build/tool-identity.integration.spec.ts](../../packages/apack-cli/tests/build/tool-identity.integration.spec.ts) | 1 passed, 0 failed, 0 pending; 38.718s. | 5 |
| [packages/apack-cli/tests/build/types-bundler-determinism.integration.spec.ts](../../packages/apack-cli/tests/build/types-bundler-determinism.integration.spec.ts) | 0 passed, 1 failed, 0 pending; 102.867s. | 1 |
| [packages/apack-cli/tests/build/watch-external-types.integration.spec.ts](../../packages/apack-cli/tests/build/watch-external-types.integration.spec.ts) | 0 passed, 1 failed, 0 pending; 89.473s. | 3 |
| [packages/apack-cli/tests/build/watch-module-freshness.integration.spec.ts](../../packages/apack-cli/tests/build/watch-module-freshness.integration.spec.ts) | 0 passed, 2 failed, 0 pending; 120.017s. | 2 |
| [packages/apack-cli/tests/build/watch-publication.integration.spec.ts](../../packages/apack-cli/tests/build/watch-publication.integration.spec.ts) | 0 passed, 2 failed, 0 pending; 120.047s. | 6 |
| [packages/apack-cli/tests/build/watch-worker-inputs.integration.spec.ts](../../packages/apack-cli/tests/build/watch-worker-inputs.integration.spec.ts) | 0 passed, 1 failed, 0 pending; 120.082s. | 4 |
| [packages/apack-cli/tests/commands/add-extensions.integration.spec.ts](../../packages/apack-cli/tests/commands/add-extensions.integration.spec.ts) | 15 passed, 3 failed, 0 pending; 484.585s. | 5 |
| [packages/apack-cli/tests/commands/add-feature-validate.integration.spec.ts](../../packages/apack-cli/tests/commands/add-feature-validate.integration.spec.ts) | 13 passed, 0 failed, 0 pending; 128.273s. | 1 |
| [packages/apack-cli/tests/commands/app-install.integration.spec.ts](../../packages/apack-cli/tests/commands/app-install.integration.spec.ts) | 1 passed, 0 failed, 0 pending; 0.224s. | 1 |
| [packages/apack-cli/tests/commands/db.integration.spec.ts](../../packages/apack-cli/tests/commands/db.integration.spec.ts) | 64 passed; 46.855s. | — |
| [packages/apack-cli/tests/commands/default-pack-archive.integration.spec.ts](../../packages/apack-cli/tests/commands/default-pack-archive.integration.spec.ts) | 1 passed, 0 failed, 0 pending; 30.428s. | 4 |
| [packages/apack-cli/tests/commands/dev-build.integration.spec.ts](../../packages/apack-cli/tests/commands/dev-build.integration.spec.ts) | 2 passed, 0 failed, 0 pending; 49.975s. | 3 |
| [packages/apack-cli/tests/commands/doctor.integration.spec.ts](../../packages/apack-cli/tests/commands/doctor.integration.spec.ts) | 9 passed, 0 failed, 0 pending; 0.670s. | 3 |
| [packages/apack-cli/tests/commands/facade-report.integration.spec.ts](../../packages/apack-cli/tests/commands/facade-report.integration.spec.ts) | 10 passed, 1 failed, 0 pending; 149.049s. | 5 |
| [packages/apack-cli/tests/commands/info.integration.spec.ts](../../packages/apack-cli/tests/commands/info.integration.spec.ts) | 0 passed, 1 failed, 0 pending; 60.195s. | 4 |
| [packages/apack-cli/tests/commands/pack-doctor.integration.spec.ts](../../packages/apack-cli/tests/commands/pack-doctor.integration.spec.ts) | 14 passed, 0 failed, 0 pending; 32.240s. | 3 |
| [packages/apack-cli/tests/commands/release.integration.spec.ts](../../packages/apack-cli/tests/commands/release.integration.spec.ts) | 31 passed; 5.375s. | — |
| [packages/apack-cli/tests/commands/scaffold.integration.spec.ts](../../packages/apack-cli/tests/commands/scaffold.integration.spec.ts) | 6 passed, 5 failed, 0 pending; 558.005s. | 2 |
| [packages/apack-cli/tests/harness/dependency-runtime.integration.spec.ts](../../packages/apack-cli/tests/harness/dependency-runtime.integration.spec.ts) | 5 passed, 0 failed, 0 pending; 32.239s. | 6 |
| [packages/apack-cli/tests/harness/harness-setup.integration.spec.ts](../../packages/apack-cli/tests/harness/harness-setup.integration.spec.ts) | 7 passed, 0 failed, 0 pending; 59.812s. | 6 |
| [packages/repo-checks/tests/bounded-spawn.integration.spec.ts](../../packages/repo-checks/tests/bounded-spawn.integration.spec.ts) | 4 passed, 0 failed, 0 pending; 6.831s. | 2 |
| [packages/repo-checks/tests/component-contracts.integration.spec.ts](../../packages/repo-checks/tests/component-contracts.integration.spec.ts) | 3 passed, 0 failed, 0 pending; 6.665s. | 5 |
| [packages/repo-checks/tests/dep-files.integration.spec.ts](../../packages/repo-checks/tests/dep-files.integration.spec.ts) | 30 passed; 2.598s. | — |
| [packages/repo-checks/tests/dev-pack-hmr.integration.spec.ts](../../packages/repo-checks/tests/dev-pack-hmr.integration.spec.ts) | 2 passed, 1 failed, 0 pending; 0.008s. | 3 |
| [packages/repo-checks/tests/fingerprint-scope.integration.spec.ts](../../packages/repo-checks/tests/fingerprint-scope.integration.spec.ts) | 10 passed, 0 failed, 0 pending; 5.974s. | 2 |
| [packages/repo-checks/tests/import-specifiers-script.integration.spec.ts](../../packages/repo-checks/tests/import-specifiers-script.integration.spec.ts) | 2 passed, 0 failed, 0 pending; 9.040s. | 4 |
| [packages/repo-checks/tests/import-specifiers.integration.spec.ts](../../packages/repo-checks/tests/import-specifiers.integration.spec.ts) | 302 passed; 11.278s. | — |
| [packages/repo-checks/tests/session.integration.spec.ts](../../packages/repo-checks/tests/session.integration.spec.ts) | 10 passed, 0 failed, 0 pending; 4.820s. | 3 |
| [packages/repo-checks/tests/spec-durations-reporter.integration.spec.ts](../../packages/repo-checks/tests/spec-durations-reporter.integration.spec.ts) | 11 passed, 0 failed, 0 pending; 46.642s. | 6 |
| [packages/publish-checks/tests/published-declarations.integration.spec.ts](../../packages/publish-checks/tests/published-declarations.integration.spec.ts) | 1 passed, 0 failed, 0 pending; 4.197s. | 3 |
| [packages/publish-checks/tests/published-exports.integration.spec.ts](../../packages/publish-checks/tests/published-exports.integration.spec.ts) | 4 passed, 0 failed, 0 pending; 7.090s. | 5 |
| [packages/publish-checks/tests/published-manifest-paths.integration.spec.ts](../../packages/publish-checks/tests/published-manifest-paths.integration.spec.ts) | 5 passed, 0 failed, 0 pending; 4.780s. | 5 |
| [packages/publish-checks/tests/published-sdk-any.integration.spec.ts](../../packages/publish-checks/tests/published-sdk-any.integration.spec.ts) | 14 passed, 0 failed, 0 pending; 7.866s. | 3 |
| [packages/publish-checks/tests/published-sdk-types.integration.spec.ts](../../packages/publish-checks/tests/published-sdk-types.integration.spec.ts) | 10 passed, 0 failed, 0 pending; 20.639s. | 4 |
| [packages/publish-checks/tests/published-ui-types.integration.spec.ts](../../packages/publish-checks/tests/published-ui-types.integration.spec.ts) | 4 passed, 0 failed, 0 pending; 6.228s. | 5 |

## Execution setup (completed)

Workflow-only `32ec489cf` on main `1a6304827` ran six sequential batches, two workers and unchanged
main per-test deadlines. Each had a 900s aggregate bound; the 120m job envelope included preparation.
Failures did not suppress later batches. The earlier eight passing files and Windows skip were excluded.

## Completed six-batch inventory (2026-10-19)

Run [39214676663](https://github.com/spankyed/AgentBuddy/actions/runs/39214676663) is terminal.
All six batches completed normally under their existing test limits; none hit its 900s aggregate bound.
All **59 unique file reports** are retained. They report **251 passed, 38 failed and 50 pending cases**.
Of the pending cases, **47** were blocked by failed facade/dependency setup hooks; two ELF cases skip
on macOS and one frontend-server case is a declared configuration skip. Reporting a file does not prove
its blocked bodies executed. Preserve the earlier eight completed files and their 495 passes separately.

| Batch | Files | Passed | Failed | Pending | Complete invocation |
|---|---:|---:|---:|---:|---:|
| 1 | 8 | 33 | 3 | 15 | 663.194s |
| 2 | 10 | 30 | 9 | 0 | 570.221s |
| 3 | 11 | 58 | 7 | 32 | 516.449s |
| 4 | 10 | 39 | 8 | 2 | 402.359s |
| 5 | 10 | 44 | 6 | 1 | 544.336s |
| 6 | 10 | 47 | 5 | 0 | 245.763s |

The six invocations total **2,942.322s**, excluding the one shared preparation. This is a failed-run
measurement, not a completed normal-suite budget: timed-out and blocked operations are incomplete.
The normal 600s aggregate is contradicted by both this inventory and the earlier native file alone.

### Classification of every failed case

Categories identify the observed boundary, not an inferred root cause. A wait's final assertion error
is classified by its explicit 20s operation deadline. Actual assertion failures remain separate even
when prior timeout leakage is a plausible cause. No event, operation or cleanup deadline is changed.

| Batch | File | Case | Classification | Reported duration |
|---|---|---|---|---:|
| 1 | `apack-cli/tests/build/build-output-swap.integration.spec.ts` | a build that fails does not reuse facade files from an incumbent with stamps from a refused replacement | Whole-scenario timeout | 143.379s |
| 1 | `apack-cli/tests/build/build-output-swap.integration.spec.ts` | a build that fails publishes help as snapshot data and retains accepted articles after an invalid edit | Whole-scenario timeout | 76.959s |
| 1 | `apack-cli/tests/build/types-bundler-determinism.integration.spec.ts` | facade bundle determinism (needs dist: npm run packages:build) is identical from the workspace and from the packed tarballs a consumer installs | Whole-scenario timeout | 102.867s |
| 2 | `apack-cli/tests/commands/scaffold.integration.spec.ts` | apack pack init → add feature → build → tsc → pack adds a feature, builds, typechecks and packs a verified archive | Whole-scenario timeout | 60.073s |
| 2 | `apack-cli/tests/commands/scaffold.integration.spec.ts` | apack pack init → add feature → build → tsc → pack records the facade dependents compile against, and then reports it up to date | Assertion failure | 0.038s |
| 2 | `apack-cli/tests/commands/scaffold.integration.spec.ts` | apack pack init → add feature → build → tsc → pack adds a step (declared, shipped in build/steps.build.mjs) and a service that build | Assertion failure | 67.500s |
| 2 | `apack-cli/tests/commands/scaffold.integration.spec.ts` | apack pack init → add feature → build → tsc → pack regenerates entries when a source file codegen reads changes, not only the manifest | Whole-scenario timeout | 78.388s |
| 2 | `apack-cli/tests/commands/scaffold.integration.spec.ts` | apack pack init → add feature → build → tsc → pack fails the build on an unresolvable dependency | Assertion failure | 321.866s |
| 2 | `apack-cli/tests/build/dependency-inputs.integration.spec.ts` | retains the consumer build when a content compiler changes accepted dependency bytes | Whole-scenario timeout | 71.279s |
| 2 | `apack-cli/tests/build/frontend-workers.integration.spec.ts` | retains the accepted build after a worker error and publishes its repair | Whole-scenario timeout | 66.786s |
| 2 | `apack-cli/tests/build/watch-module-freshness.integration.spec.ts` | refreshes flow modules loaded through ordinary imports on the next watched build | Whole-scenario timeout | 60.013s |
| 2 | `apack-cli/tests/build/watch-module-freshness.integration.spec.ts` | recompiles changed transitive content modules and retains the accepted build on failure | Whole-scenario timeout | 60.004s |
| 3 | `apack-cli/tests/build/frontend-resources.integration.spec.ts` | rebuilds Vue styles after only an external stylesheet changes | Whole-scenario timeout | 62.615s |
| 3 | `apack-cli/tests/build/frontend-resources.integration.spec.ts` | CSS dependency watching recovers a missing nested stylesheet while retaining the accepted build | Individual-operation timeout (20s rebuild wait) | 76.251s |
| 3 | `apack-cli/tests/build/frontend-resources.integration.spec.ts` | watches an external css-url asset in a separate directory | Whole-scenario timeout | 60.025s |
| 3 | `apack-cli/tests/build/frontend-resources.integration.spec.ts` | watches an external template asset in a separate directory | Whole-scenario timeout | 60.026s |
| 3 | `apack-cli/tests/build/frontend-resources.integration.spec.ts` | watches initially empty external Tailwind content through nested directory links | Individual-operation timeout (20s rebuild wait) | 54.304s |
| 3 | `apack-cli/tests/build/watch-external-types.integration.spec.ts` | rebuilds external contracts and recovers a retargeted missing input without an authored edit | Individual-operation timeout (20s rebuild wait) | 89.473s |
| 3 | `repo-checks/tests/dev-pack-hmr.integration.spec.ts` | a pack whose source this machine has has 'a pack outside the workspace' in the renderer's own module graph, accepting its own updates | Assertion failure | 0.006s |
| 4 | `apack-cli/tests/build/build-registry.integration.spec.ts` | a build compiles flows against the steps it loaded, and leaves the bound registry untouched | Whole-scenario timeout | 63.860s |
| 4 | `apack-cli/tests/build/editor-declarations.integration.spec.ts` | builds declared editor members and step presentation, then discovers a copied source-free build | Whole-scenario timeout | 60.067s |
| 4 | `apack-cli/tests/build/package-inputs.integration.spec.ts` | rebuilds the frontend when an undeclared imported package changes behind unchanged types | Whole-scenario timeout | 60.465s |
| 4 | `apack-cli/tests/build/package-inputs.integration.spec.ts` | automatically rebuilds an undeclared runtime imported by 'TypeScript state' without a type or authored edit | Whole-scenario timeout | 60.014s |
| 4 | `apack-cli/tests/build/package-inputs.integration.spec.ts` | automatically rebuilds an undeclared runtime imported by 'Vue canvas' without a type or authored edit | Assertion failure | 42.740s |
| 4 | `apack-cli/tests/build/package-inputs.integration.spec.ts` | keeps a captured build current after standalone generation with unchanged generated code | Whole-scenario timeout | 63.753s |
| 4 | `apack-cli/tests/build/watch-worker-inputs.integration.spec.ts` | rebuilds for worker inputs and repairs missing external reads without authored edits | Whole-scenario timeout | 120.082s |
| 4 | `apack-cli/tests/commands/info.integration.spec.ts` | external pack offline inspection reports authentic compiled content and cached dependency provenance after producer source removal | Whole-scenario timeout | 60.195s |
| 5 | `apack-cli/tests/build/frontend-generation.integration.spec.ts` | refreshes backend and live frontend together, retains failed incumbents and awaits retirement | Whole-scenario timeout | 125.561s |
| 5 | `apack-cli/tests/build/staged-dsl.integration.spec.ts` | staged DSL definitions preserves a verified build on a later failure, then publishes and reuses the current definitions with its frontend | Whole-scenario timeout | 146.979s |
| 5 | `apack-cli/tests/commands/add-extensions.integration.spec.ts` | apack pack add artifact and block scaffolds an artifact viewer taking artifact, declared with its icon and viewer | Whole-scenario timeout | 63.446s |
| 5 | `apack-cli/tests/commands/add-extensions.integration.spec.ts` | apack pack add artifact and block scaffolds display blocks taking their props and input blocks taking disabled/response, emitting submit/cancel | Whole-scenario timeout | 78.690s |
| 5 | `apack-cli/tests/commands/add-extensions.integration.spec.ts` | apack pack add migration declares each migration under its version line and the version it targets, which the pack entry registers and tsc accepts | Whole-scenario timeout | 153.376s |
| 5 | `apack-cli/tests/commands/facade-report.integration.spec.ts` | apack pack facade-report checks the verified current build without changing generated files | Assertion failure | 2.891s |
| 6 | `apack-cli/tests/build/compilation-inputs.integration.spec.ts` | captures runtime export conditions as well as package bytes | Assertion failure | 4.132s |
| 6 | `apack-cli/tests/build/compilation-inputs.integration.spec.ts` | invalidates cached compilation when preload order changes with identical file inputs | Assertion failure | 3.427s |
| 6 | `apack-cli/tests/build/compilation-inputs.integration.spec.ts` | invalidates compilation when native execution flags change | Assertion failure | 4.137s |
| 6 | `apack-cli/tests/build/watch-publication.integration.spec.ts` | publishes source and manifest edits together and retains the incumbent after refusal | Whole-scenario timeout (setup hook) | 60.034s |
| 6 | `apack-cli/tests/build/watch-publication.integration.spec.ts` | follows retargeted manifest links through refusal, repair and atomic replacement | Whole-scenario timeout (setup hook) | 60.013s |

Additional failures outside individual case results:

- **Whole-scenario setup timeouts (60s):** dependency-graph setup; facade-typing workspace setup;
  facade-typing-published setup; both facade-type-data dependency variants. These prevent 47 bodies
  from executing. The two watch-publication beforeEach timeouts are already counted in the case table.
- **Cleanup failure:** frontend-resources afterAll removes its retained compiler-input directory and
  receives `ENOTEMPTY`. Timed-out work and ownership must be inspected before changing deletion.
- **Individual-operation timeouts:** five Vitest `onTaskUpdate` RPC timeouts (two in batch 1; one each
  in batches 2, 5 and 6). Their cause is unproven. They are not product assertion failures or permission
  to disable reporting deadlines.
- **Consequential assertion failure:** final inventory collector correctly rejects nonzero batch
  exits after confirming 59 file reports. This is not a missing-report or aggregate-timeout failure.

### Repair boundaries and next action

Source **`1e6e7aea7`** repairs direct compilation's execution-input freshness. Its `current()` hash
reused an identity captured once, so later environment/flag changes were invisible. Direct compilation
now rechecks that identity; an owned worker continues to use its actual captured startup identity.
Three inert Node/tsx controls pass: export-condition changes, preload reordering and execution-flag
changes invalidate, change the next identity, and accept exact restoration. No compiler runtime or
native fixture is launched. CLI `tsc --noEmit` and focused correctness lint pass. The existing three
integration assertions remain unchanged and still need affected-suite/final acceptance.

Source **`ac45e89a5`** closes two fixture-premise defects. Repository integration reads the external
packs' generated frontend entries, so its existing suite input declaration now includes fixture outputs
and follows `test:external-pack:contract`; the fast half retains its source-only exclusions. The HMR
setup refuses missing generation explicitly and restores its environment override. Passive facade
inspection now builds after the prior case creates the authored report, before capturing the files
it promises not to modify. Production freshness/refusal rules and result assertions are unchanged.
The 105 graph/input checks pass, including removing the fixture dependency through an exclusion
mutation. Scripts, repo-checks and CLI typechecks and focused lint pass. Real HMR/facade execution
remains part of the affected-case run after the repair pass; no broad run was started.

Source **`401ec05be`** fixes watcher fixture ownership in frontend-resources, package-inputs and
watch-publication. Pending startup is retained before awaiting it, uses Vitest's existing cancellation
signal, and settles before directory deletion. Frontend fixtures drain every returned owner before
reporting close failures. Inspection of installed Vitest 3.2.4 confirms `afterEach` precedes
`onTestFinished`, so a late finished hook cannot protect a directory deleted by `afterEach`.
The new mocked regression proves cancellation during startup waits for owner closure before rejecting
without a returned watcher handle. All 19 mocked watcher lifecycle checks pass; the five unchanged
coalescing checks also pass. CLI types and focused lint pass. No event/build/scenario/cleanup deadline
is changed here. Real fixture execution and the three 20s wait failures remain unaccepted until the
affected run; do not treat this source repair as proof that every observed watcher failure is resolved.

Source **`b57d81cc1`** composes 38 named case/setup declarations from their inspected phases, including
the five-build DSL case, four-build diamond setup, shared facade setup, watcher startup plus existing
event waits, and the earlier exit-handler timeout. The existing exception table records each sequence.
Global test/config defaults and all existing `vi.waitFor` calls remain unchanged. Shared-helper overrides
are now inventoried too: helpers have no runnable target budget, so each explicit deadline needs review.
The two public facade-comparison commands are asynchronous, each bounded at 180s with test cancellation;
their owner waits for the active command before deleting inputs. In-process CLI/TypeScript helpers yield
a loop turn after completing their work and restoring globals, allowing pending runner updates through.

The Electron command owner records `error` but settles only after `close`; abort retains its existing
command limit and escalates termination after two seconds. An inert Node control evaluates the actual
command function from old/current source: the old promise rejects while the child remains live
(`closedBeforeRejection: false`, signal null); the repair rejects only after closure with `SIGKILL`.
Both probe children are reaped. This is lifecycle evidence, not native/Electron execution acceptance;
no captured runtime or addon runs locally. The existing exit-handler case now explicitly retains its
builder, uses test cancellation and drains it through the existing fixture owner.

Validation: all **57** timeout-policy, subprocess-inventory and wait checks pass; CLI and repo-checks
`tsc --noEmit` and correctness lint over all 23 changed TypeScript files pass. An AST comparison confirms
the 20 changed CLI specs retain their assertion calls and event waits before the explicit exit-handler
owner adjustment; its refusal, seal, incumbent and staging assertions remain. No normal integration or
strict acceptance is claimed. Next run the affected files and the changed native/worker cases on one
prepared disposable runner with two workers and the committed per-test limits; retain every result.
Then settle normal grouping/aggregate allowance from the complete measurements, pass normal integration
and run the final strict gate. Do not rerun the completed prefix as another diagnostic inventory.

Affected acceptance [39227491937](https://github.com/spankyed/AgentBuddy/actions/runs/39227491937)
is dispatched on workflow-only **`8036d3014`**, based on main **`1f31d38fd`**. One prepared disposable
macOS checkout runs typecheck records, default-setup and the declared external fixture producer first.
Then three explicit eight-file batches cover all **24 failing files** from the inventory. Selected
native command/search/suffix controls and five changed worker mutation/cancellation cases follow.
All use exactly two workers and committed per-test deadlines, with no private overrides. Batch
cutoffs are 30m; the selected control groups each have 15m. The 150m envelope includes all five
cutoffs and preparation. Later groups run after a failed group; stdout and stderr, JSON and exit/timing
records are retained. YAML, six embedded scripts, exact file coverage, prerequisite gating and the
workflow-only diff are checked before dispatch. This is affected acceptance, not normal integration
or strict `--all`; both remain required after convergence. Prior diagnostic branches are preserved.

1. Validate the committed composition and lifetime repairs against the affected cases. Preserve inner
   event/operation/cleanup limits and never delete live locks or retry through them.
2. Diagnose assertion cases independently: runtime execution-option invalidation, passive facade
   authored-input freshness, external-pack HMR graph membership, and reported watcher errors. Separate
   failures caused by earlier abandoned operations from independently reproducible defects.
3. Inspect the three 20s rebuild waits to distinguish missed subscriptions from an in-progress build;
   retain their event bounds rather than converting them into broader outer timeouts.
4. Use the measured complete file/phase costs to repair normal grouping and its own aggregate budget,
   without changing every suite's class or starting the separate fast-validation refactor.
5. Validate affected cases, pass normal integration, then final strict `--all`. Setup-blocked bodies
   remain required. This diagnostic is neither gate and does not complete the active goal.

### Normal aggregate repair — 2026-10-19

Source **`21ed07fe7`** retains the normal two-worker queue and gives only complete integration the
`acceptance` aggregate class (120 minutes). Its pool runner reads the deadline from its owning chain
step instead of independently hardcoding `suite`; unit pools remain at 600 seconds. The strict job's
180-minute envelope includes preparation and app gates. Individual case, operation, event and cleanup
limits are unchanged by this checkpoint.

The eight earlier completed files contribute 2,024.100 seconds of file work. The remaining 59 reports
contribute 4,367.487 seconds, including zero-duration files with failed setup. Their combined 6,391.587
seconds imply an ideal two-worker floor of 3,195.794 seconds (53 minutes 16 seconds), before blocked
setup and shared preparation. The longest file, 906.983 seconds, does not dominate that floor. Keep the
common queue; the private batches are for diagnosis, not a new normal grouping. The new aggregate is
a backstop with room for required blocked cases, not a measured healthy-run duration. Replacing stale
historical local cost records with CI timings would misrepresent their machine/worker conditions;
the separate validation-feedback proposal remains proposed.

Validation: 167 graph/pool/input tests, scripts and repo-checks typechecks, correctness lint over four
changed TypeScript files, workflow YAML parsing and diff whitespace checks pass. An earlier 217-case
tooling run passed 216 and refused one chain-table metadata import through the existing compiler-runner
guard on this daily-use Mac. It is not a proved regression or an accepted skip: the full disposable
gate must exercise it. No local native/runtime execution or guard bypass was used. Current affected
run `39227491937` predates this aggregate checkpoint and is not normal integration or final strict
acceptance. Inspect its reports before dispatching either remaining gate.

Follow-up **`4750ad766`** closes the preparation boundary: the normal pool previously called
`npm run packages:ensure` through unbounded `execFileSync`, outside its inner suite deadline. It now
uses the existing `boundedSpawn` owner and the preparation step's declared 600s allowance, with an
attributed timeout/failure. The integration aggregate remains separate. The 121 graph/pool/orchestrator
checks pass, as do script types, lint and four existing bounded-process lifecycle checks (ordinary Node
only). An inert Node timer control reaches initialization, times out with code 124, and returns in
3,006ms: its 1,000ms test allowance plus the existing two-second process-group grace. This establishes
the reused timeout/cleanup path; the actual pool preparation still needs normal-gate acceptance.

The normal gate is prepared and pushed on `session/integration-normal-acceptance`: **`2769be3cc`**
differs from exact implementation source `4750ad766` only in its workflow. It invokes the committed
`npm run test:integration -- --all`, after typecheck records, shipped output and external contract
fixtures, with a two-core budget. It retains stderr/stdout, raw pool reports and duration caches even on
failure. Its 190-minute envelope accommodates the 120-minute pool allowance and individually bounded
preparation. It remains undispatched until affected acceptance is inspected and converges; afterward,
the unchanged main strict command remains required. No subset verdict substitutes for either gate.


### Affected acceptance result — 2026-10-19

Run [39227491937](https://github.com/spankyed/AgentBuddy/actions/runs/39227491937), source **`8036d3014`**
(workflow-only on main `1f31d38fd`), is terminal failure. All 24 selected files report:
**127 passed, 24 failed, zero pending**. Unlike the first inventory, no setup hook blocks bodies.
All **six native controls and five worker controls pass**. Their 30 pending cases are deliberate name-filter
exclusions, not accepted whole-suite coverage. Every group finished before its aggregate cutoff.

| Group | Passed | Failed | Duration |
|---|---:|---:|---:|
| Affected 1 | 54 | 8 | 1,055.397s |
| Affected 2 | 35 | 7 | 858.774s |
| Affected 3 | 38 | 9 | 691.781s |
| Native controls | 6 | 0 | 332.704s |
| Worker controls | 5 | 0 | 123.322s |

Every failed case is classified below. JSON represents the four test timeouts as `STACK_TRACE_ERROR`;
the retained console confirms their unchanged 60s scenario deadline. Event waits remain 20s.

| File | Case | Classification |
|---|---|---|
| `build/build-output-swap.integration.spec.ts` | rebuilds damaged facade data instead of renewing its checksums | Whole-scenario timeout |
| `build/build-output-swap.integration.spec.ts` | rebuilds damaged cache data instead of renewing its checksums | Whole-scenario timeout |
| `build/facade-type-data.integration.spec.ts` | typechecks own and dependency types under moduleResolution bundler | Assertion failure |
| `build/facade-type-data.integration.spec.ts` | typechecks own and dependency types under moduleResolution node16 | Assertion failure |
| `build/facade-type-data.integration.spec.ts` | typechecks own and dependency types under moduleResolution bundler | Assertion failure |
| `build/facade-type-data.integration.spec.ts` | typechecks own and dependency types under moduleResolution node16 | Assertion failure |
| `build/watch-publication.integration.spec.ts` | publishes source and manifest edits together and retains the incumbent after refusal | Individual event-wait timeout |
| `build/watch-publication.integration.spec.ts` | follows retargeted manifest links through refusal, repair and atomic replacement | Individual event-wait timeout |
| `build/dependency-graph.integration.spec.ts` | still fails when two independent packs declare the same entity | Whole-scenario timeout |
| `build/facade-typing.integration.spec.ts` | typechecks own and dependency types under moduleResolution bundler | Assertion failure |
| `build/facade-typing.integration.spec.ts` | typechecks own and dependency types under moduleResolution node16 | Assertion failure |
| `build/frontend-workers.integration.spec.ts` | retains the accepted build after a worker error and publishes its repair | Individual event-wait timeout |
| `build/package-inputs.integration.spec.ts` | automatically rebuilds an undeclared runtime imported by 'TypeScript state' without a type or authored edit | Individual event-wait timeout |
| `build/package-inputs.integration.spec.ts` | automatically rebuilds an undeclared runtime imported by 'Vue canvas' without a type or authored edit | Individual event-wait timeout |
| `commands/scaffold.integration.spec.ts` | fails the build on an unresolvable dependency | Whole-scenario timeout |
| `build/facade-typing-published.integration.spec.ts` | typechecks own and dependency types under moduleResolution bundler | Assertion failure |
| `build/facade-typing-published.integration.spec.ts` | typechecks own and dependency types under moduleResolution node16 | Assertion failure |
| `build/frontend-resources.integration.spec.ts` | recovers a missing nested stylesheet while retaining the accepted build | Individual event-wait timeout |
| `build/frontend-resources.integration.spec.ts` | watches an external css-url asset in a separate directory | Individual event-wait timeout |
| `build/frontend-resources.integration.spec.ts` | watches an external template asset in a separate directory | Individual event-wait timeout |
| `build/frontend-resources.integration.spec.ts` | watches initially empty external Tailwind content through nested directory links | Individual event-wait timeout |
| `build/watch-external-types.integration.spec.ts` | rebuilds external contracts and recovers a retargeted missing input without an authored edit | Individual event-wait timeout |
| `build/watch-module-freshness.integration.spec.ts` | refreshes flow modules loaded through ordinary imports on the next watched build | Individual event-wait timeout |
| `build/watch-module-freshness.integration.spec.ts` | recompiles changed transitive content modules and retains the accepted build on failure | Individual event-wait timeout |

Additional failures: one `frontend-resources` afterAll cleanup refuses `ENOTEMPTY`; two Vitest
`onTaskUpdate` reporting-operation timeouts occur in groups 1 and 3. No batch aggregate cutoff or failed
setup hook occurred. The collector failure follows the nonzero group results; it is not a new product defect.

Finite next work: correct the shared facade fixture's undeclared `base-pack/search` consumption while
preserving its type assertions; compose the four remaining multistep cases; diagnose the 12 event waits
with a small disposable two-case watch proof that distinguishes event receipt, build start and publication.
Trace the retained workspace cleanup and reporting failures to their owners. Do not increase event
waits or launch another broad run to diagnose these groups. Update the prepared normal-gate source
with validated repairs before dispatch; normal integration and final main strict `--all` remain required.

Complete reports and console/status records are retained under
`/private/tmp/apack-affected-39227491937/`; full stdout/stderr job output is
`/private/tmp/apack-affected-39227491937-full.log`. The machine-readable classification is
`/private/tmp/apack-affected-39227491937-classification.json`. The earlier eight-file and six-batch
evidence remains preserved; this affected run is not either remaining gate.

Raw evidence is preserved in `/private/tmp/apack-integration-remaining-39214676663-original/` (all JSON/console/
status reports), `/private/tmp/apack-integration-remaining-39214676663-full.log` (complete GHA output,
including stderr), and the run's retained upload. The per-batch `tee` files contain stdout only; use
the full log for failure messages and unhandled errors.
