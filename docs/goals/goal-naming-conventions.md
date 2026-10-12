# Names that state their contracts

Status: implementing on `session/naming-contracts`. Revised 2026-10-12 from the 2026-09-19 survey.
Base: `455a14c80`. The original counts, paths and blanket bans are superseded by this plan.

```text
Implement this goal in the isolated naming-contracts worktree. Read CLAUDE.md first.
Preserve behavior and stored user-data shapes. Migrate all owned callers, fixtures, templates and
public reports together; add no compatibility aliases. Commit each completed phase independently.
Do not publish, push, tag, change release versions or touch production data.
Finish with focused checks, updated API/facade reports and the full chain. Record outcomes and guards,
then archive this goal and repair links. Settings extraction resumes after this goal completes.
```

## Background

The current tree has 17 explicitly nullable exported get-prefixed function declarations, plus arrow
exports and nullable public registry/service methods. A function-only regex misses those members,
inferred results and aliases. The original absence-policy cleanup is complete: installed pack records
are a side table, and liveness predicates answer distinct questions. Do not redo those designs.

`PackInfo` describes installed packs including disabled ones; `RegisteredPack` would misrepresent it.
`AppEnv` already names the environment-name union, so renaming `AppContext` to it would collide.
Graph edges, logs and execution records legitimately use source. Renaming all such fields would change
stored shapes without fixing the install-path ambiguity. Context, Data and Manager can describe useful
concepts; their spelling alone does not prove a defect.

## Decisions

- find permits absence; get returns the thing or throws. Rename nullable lookups, preserving their
  results. read reads disk, fetch crosses the network, load loads executable code, resolve computes
  an answer. Collections may be empty; nullable fields inside a returned object are not absent results.
- Qualify exported types by owner. No owned module exports bare Context, including renamed aliases.
  Keep meaningful execution/compiler/RPC contexts. Args names operation inputs, Scope ambient
  dependencies, Environment resolved environment/path information. AppEnv stays the name union.
- Replace vague nouns when they hide a role. No blanket suffix ban and no forced CLIENT_CONNECTED
  payload naming. Preserve native/library vocabulary and APIs that answer genuinely different questions.
- Keep settings-specific renames in the settings plan; do not rename that surface twice.
- Distinguish install dispatch kind, local input path and integrity provenance. Keep unrelated source
  fields and persisted value shapes unchanged. Check artifact-format implications independently.
- Guards cover owned exported nullable getters and bare Context exports. They are repo conventions,
  not a new mandatory rule for external pack authors. Do not build retired-word ban lists.

## Phases

### 1. Establish the contract and baseline

Write the concise conventions in CLAUDE.md, audit current exports/callers and run the baseline chain.
Resolve environmental check failures without deleting the repository lockfile or weakening assertions.
Commit the revised goal and conventions.

### 2. Make nullable lookup names honest

Rename nullable exported get-prefixed functions and callable members, including async and inferred
returns. Rename optional step/artifact/block registry get methods to find. Follow calls, generated
code, fixtures and docs. Keep required getters and native methods. Preserve errors and absence values.
Done when affected specs/typechecks and public reports agree; commit this phase.

### 3. Name owners and roles

- RPC Context/createContext -> RpcContext/createRpcContext; Code Context exports -> qualified owners.
- AppContext/resolveAppContext -> AppEnvironment/resolveAppEnvironment; MainAppContext and accessors
  follow that spelling. ModuleContext -> MainModuleScope. Keep AppEnv unchanged.
- PackInfo -> InstalledPackSummary; PackFeatureInfo -> PackFeatureSummary; HostInfo -> HostCompatibility.
- ExportInfo -> ModuleExport; BackupInfo -> BackupSummary; SecretInfo -> SecretMetadata.
- AppHelper -> TestApp; EngineAppHelper -> EngineTestApp.

Keep meaningful compiler/execution contexts, lifecycle managers and Data types. Migrate helper names
that explicitly include renamed types. Regenerate API/facade reports, review and commit.

### 4. Disambiguate installation inputs

Rename source dispatch arguments/events/requests to sourceKind; the local install input to inputPath;
integrity source and staging options to provenance. Update writers/readers and fixture artifacts
without aliases. Preserve dispatch and URL inference behavior. Do not touch package release versions.
Done when local/archive/URL/GitHub dispatch and provenance round-trip tests pass; commit.

### 5. Guard and finish

Put checks in the existing repository-check suite, using TypeScript return analysis plus explicit
signature checks where any/unknown erases nullable unions. Cover public members, arrows, aliases,
Vue scripts and inferred returns; exclude dependency/native contracts. Check bare Context exports
including aliases. Test firing cases and demonstrate enforcement fails when each guard is disabled.

Regenerate affected reports/facade, run focused specs and the full chain including external-pack and
packaged-authoring checks, review the final diff, record outcomes and archive the goal. Commit.

## Acceptance

- Missing lookup results and runtime side effects are unchanged; required getters still throw.
- Nullable aliases/async/inferred exports and public methods are checked; optional object fields,
  native Map.get and dependency declarations are not misclassified.
- A bare exported Context alias is detected. Qualified RPC/compiler/XState contexts are allowed.
- Directory/archive, URL and GitHub installs retain routing; provenance survives staging/release.
- Reports, templates, fixtures and docs use the actual APIs. No compatibility aliases remain.
- Existing data values and settings behavior are unchanged. No production data is used in tests.

## Constraints

Use the current isolated worktree and independent dependencies/output. Follow package CLAUDE.md files
and the typed EARS checklist for touched signatures; change no typed-query behavior to satisfy a rename.
Use current npm scripts, not the retired build command. Do not edit archived historical documents.
Every newly enforceable rule has a firing case; semantic noun choices stay review guidance.
