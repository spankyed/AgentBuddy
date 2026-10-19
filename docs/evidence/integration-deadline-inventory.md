# Integration deadline inventory

Status: incomplete execution coverage; all 68 source files inventoried. Main source `27e9e4109`;
latest owning-goal checkpoint `9d0dde3e3`. No further normal integration or strict run until the
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

| File | Current execution evidence |
|---|---|
| [packages/apack-cli/tests/build/build-output-swap.integration.spec.ts](../../packages/apack-cli/tests/build/build-output-swap.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/build-registry.integration.spec.ts](../../packages/apack-cli/tests/build/build-registry.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/build-worker.integration.spec.ts](../../packages/apack-cli/tests/build/build-worker.integration.spec.ts) | 16 passed; 574.740s. |
| [packages/apack-cli/tests/build/compilation-inputs.integration.spec.ts](../../packages/apack-cli/tests/build/compilation-inputs.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/compiler-configuration.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-configuration.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/compiler-elf-libraries.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-elf-libraries.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/compiler-esbuild-configuration.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-esbuild-configuration.integration.spec.ts) | 15 passed; 232.409s. |
| [packages/apack-cli/tests/build/compiler-file-reads.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-file-reads.integration.spec.ts) | 12 passed; 243.862s. |
| [packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-native-libraries.integration.spec.ts) | 25 passed; 906.983s. |
| [packages/apack-cli/tests/build/compiler-pe-libraries.integration.spec.ts](../../packages/apack-cli/tests/build/compiler-pe-libraries.integration.spec.ts) | 26 Windows-only cases skipped; retain the owning goal’s Windows evidence. |
| [packages/apack-cli/tests/build/declaration-aliases.integration.spec.ts](../../packages/apack-cli/tests/build/declaration-aliases.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/dependency-flow-helpers.integration.spec.ts](../../packages/apack-cli/tests/build/dependency-flow-helpers.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/dependency-graph.integration.spec.ts](../../packages/apack-cli/tests/build/dependency-graph.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/dependency-inputs.integration.spec.ts](../../packages/apack-cli/tests/build/dependency-inputs.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/dsl-defs.integration.spec.ts](../../packages/apack-cli/tests/build/dsl-defs.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/dsl-snapshot.integration.spec.ts](../../packages/apack-cli/tests/build/dsl-snapshot.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/editor-declarations.integration.spec.ts](../../packages/apack-cli/tests/build/editor-declarations.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/facade-gate-system-contract.integration.spec.ts](../../packages/apack-cli/tests/build/facade-gate-system-contract.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/facade-gate.integration.spec.ts](../../packages/apack-cli/tests/build/facade-gate.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/facade-type-data.integration.spec.ts](../../packages/apack-cli/tests/build/facade-type-data.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/facade-typing-published.integration.spec.ts](../../packages/apack-cli/tests/build/facade-typing-published.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/facade-typing.integration.spec.ts](../../packages/apack-cli/tests/build/facade-typing.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/fe-bundler-dev-server.integration.spec.ts](../../packages/apack-cli/tests/build/fe-bundler-dev-server.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/fe-bundler-host-registry.integration.spec.ts](../../packages/apack-cli/tests/build/fe-bundler-host-registry.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/fe-bundler-opaque-deps.integration.spec.ts](../../packages/apack-cli/tests/build/fe-bundler-opaque-deps.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/frontend-generation.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-generation.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/frontend-globs.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-globs.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/frontend-outputs.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-outputs.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/frontend-resources.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-resources.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/frontend-workers.integration.spec.ts](../../packages/apack-cli/tests/build/frontend-workers.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/own-declarations.integration.spec.ts](../../packages/apack-cli/tests/build/own-declarations.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/package-inputs.integration.spec.ts](../../packages/apack-cli/tests/build/package-inputs.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/staged-dsl.integration.spec.ts](../../packages/apack-cli/tests/build/staged-dsl.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/tool-identity.integration.spec.ts](../../packages/apack-cli/tests/build/tool-identity.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/types-bundler-determinism.integration.spec.ts](../../packages/apack-cli/tests/build/types-bundler-determinism.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/watch-external-types.integration.spec.ts](../../packages/apack-cli/tests/build/watch-external-types.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/watch-module-freshness.integration.spec.ts](../../packages/apack-cli/tests/build/watch-module-freshness.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/watch-publication.integration.spec.ts](../../packages/apack-cli/tests/build/watch-publication.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/build/watch-worker-inputs.integration.spec.ts](../../packages/apack-cli/tests/build/watch-worker-inputs.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/add-extensions.integration.spec.ts](../../packages/apack-cli/tests/commands/add-extensions.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/add-feature-validate.integration.spec.ts](../../packages/apack-cli/tests/commands/add-feature-validate.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/app-install.integration.spec.ts](../../packages/apack-cli/tests/commands/app-install.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/db.integration.spec.ts](../../packages/apack-cli/tests/commands/db.integration.spec.ts) | 64 passed; 46.855s. |
| [packages/apack-cli/tests/commands/default-pack-archive.integration.spec.ts](../../packages/apack-cli/tests/commands/default-pack-archive.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/dev-build.integration.spec.ts](../../packages/apack-cli/tests/commands/dev-build.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/doctor.integration.spec.ts](../../packages/apack-cli/tests/commands/doctor.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/facade-report.integration.spec.ts](../../packages/apack-cli/tests/commands/facade-report.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/info.integration.spec.ts](../../packages/apack-cli/tests/commands/info.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/pack-doctor.integration.spec.ts](../../packages/apack-cli/tests/commands/pack-doctor.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/commands/release.integration.spec.ts](../../packages/apack-cli/tests/commands/release.integration.spec.ts) | 31 passed; 5.375s. |
| [packages/apack-cli/tests/commands/scaffold.integration.spec.ts](../../packages/apack-cli/tests/commands/scaffold.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/harness/dependency-runtime.integration.spec.ts](../../packages/apack-cli/tests/harness/dependency-runtime.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/apack-cli/tests/harness/harness-setup.integration.spec.ts](../../packages/apack-cli/tests/harness/harness-setup.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/repo-checks/tests/bounded-spawn.integration.spec.ts](../../packages/repo-checks/tests/bounded-spawn.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/repo-checks/tests/component-contracts.integration.spec.ts](../../packages/repo-checks/tests/component-contracts.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/repo-checks/tests/dep-files.integration.spec.ts](../../packages/repo-checks/tests/dep-files.integration.spec.ts) | 30 passed; 2.598s. |
| [packages/repo-checks/tests/dev-pack-hmr.integration.spec.ts](../../packages/repo-checks/tests/dev-pack-hmr.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/repo-checks/tests/fingerprint-scope.integration.spec.ts](../../packages/repo-checks/tests/fingerprint-scope.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/repo-checks/tests/import-specifiers-script.integration.spec.ts](../../packages/repo-checks/tests/import-specifiers-script.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/repo-checks/tests/import-specifiers.integration.spec.ts](../../packages/repo-checks/tests/import-specifiers.integration.spec.ts) | 302 passed; 11.278s. |
| [packages/repo-checks/tests/session.integration.spec.ts](../../packages/repo-checks/tests/session.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/repo-checks/tests/spec-durations-reporter.integration.spec.ts](../../packages/repo-checks/tests/spec-durations-reporter.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/publish-checks/tests/published-declarations.integration.spec.ts](../../packages/publish-checks/tests/published-declarations.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/publish-checks/tests/published-exports.integration.spec.ts](../../packages/publish-checks/tests/published-exports.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/publish-checks/tests/published-manifest-paths.integration.spec.ts](../../packages/publish-checks/tests/published-manifest-paths.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/publish-checks/tests/published-sdk-any.integration.spec.ts](../../packages/publish-checks/tests/published-sdk-any.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/publish-checks/tests/published-sdk-types.integration.spec.ts](../../packages/publish-checks/tests/published-sdk-types.integration.spec.ts) | Unexecuted; source operations inventoried. |
| [packages/publish-checks/tests/published-ui-types.integration.spec.ts](../../packages/publish-checks/tests/published-ui-types.integration.spec.ts) | Unexecuted; source operations inventoried. |

## Next bounded work

Complete only the 59 unexecuted files in focused batches, retaining a report per batch and continuing
to the next batch after an attributed failure. Reuse one prepared disposable checkout and two workers;
do not rerun the 495 completed cases merely to rediscover the cutoff. Private observation limits remain
separate from main. Classify every new failure into the four categories above, recording an incomplete
batch explicitly if its aggregate limit fires.

Then make one composition repair from the complete inventory, validate affected cases, pass **normal**
integration with assertions and operation/event/cleanup bounds preserved, and run the final strict gate.
The complete active goal, every required acceptance boundary and archival conditions remain unchanged.
