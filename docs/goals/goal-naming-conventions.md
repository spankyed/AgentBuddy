# Names that state their contracts

Status: implementing on `session/naming-contracts`. Revised 2026-10-12 from the 2026-09-19 survey.
Base: `e108d6a25` (rebased after PR #244 merged). The original counts, paths and blanket bans are superseded by this plan.

```text
Implement this goal on the naming-contracts branch in the main checkout. Read CLAUDE.md first.
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

- Preserve coherent API families: get/set/delete for keyed stores, getX for property accessors,
  find/findByX for searches and domain queries. A nullable result alone does not justify a rename.
  Return types and docs state absence; getOrThrow explicitly names required retrieval when needed.
  read reads disk, fetch crosses the network, load loads executable code, resolve computes an answer.
  Preserve behavior, including absence values; do not introduce required retrieval during this goal.
- Qualify exported types by owner. No owned module exports bare Context, including renamed aliases.
  Keep meaningful execution/compiler/RPC contexts. Args names operation inputs, Scope ambient
  dependencies, Environment resolved environment/path information. AppEnv stays the name union.
- Replace vague nouns when they hide a role. No blanket suffix ban and no forced CLIENT_CONNECTED
  payload naming. Preserve native/library vocabulary and APIs that answer genuinely different questions.
- Keep settings-specific renames in the settings plan; do not rename that surface twice.
- Distinguish install dispatch kind, local input path and integrity provenance. Keep unrelated source
  fields and persisted value shapes unchanged. Check artifact-format implications independently.
- Guard bare Context exports. Do not enforce a universal nullable-getter ban: it contradicts familiar
  key-value and accessor APIs. Verb choices require API-family review, not a spelling check.

## Phases

### 1. Establish the contract and baseline

Write the concise conventions in CLAUDE.md, audit current exports/callers and run the baseline chain.
Resolve environmental check failures without deleting the repository lockfile or weakening assertions.
Commit the revised goal and conventions.

### 2. Review lookup naming by API family

The initial mechanical nullable-getter sweep was too broad. KeyVault has been restored to get/set/delete.
Review the remaining uncommitted renames before accepting them: registries, EARS getAttr/getAttrs,
component getEditor and property/state accessors have established getter semantics even when absent.
Keep or restore those families. Retain find renames only where they clarify a search or domain query.
Review required callbacks too: renaming a nullable accessor must not rename an unrelated required
getEditor callback. Follow justified changes through callers, fixtures and public reports.
Done when each retained rename has a semantic reason and focused checks pass; commit this phase.

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

Put the bare Context export check in the existing repository-check suite, including aliases and Vue
scripts; exclude dependency declarations. Test firing cases and demonstrate enforcement fails when
the guard is disabled. Review verb choices by API family; do not replace that judgment with a
nullable-return ban.

Regenerate affected reports/facade, run focused specs and the full chain including external-pack and
packaged-authoring checks, review the final diff, record outcomes and archive the goal. Commit.

## Phase review checkpoint

After every phase, inspect the complete diff for bugs, missed callers, unrelated changes and API
coherence. State why each retained rename improves meaning; specifically compare neighboring methods
and required callbacks. Run relevant checks, record evidence here and commit only this goal’s changes.
Do not use a passing typecheck as proof that a name is a better design.

## Acceptance

- Missing lookup results and runtime side effects are unchanged; required getters still throw.
- Coherent store, registry and accessor APIs retain conventional getter names. Search/domain-query
  renames have a concrete semantic reason; nullability alone is insufficient.
- A bare exported Context alias is detected. Qualified RPC/compiler/XState contexts are allowed.
- Directory/archive, URL and GitHub installs retain routing; provenance survives staging/release.
- Reports, templates, fixtures and docs use the actual APIs. No compatibility aliases remain.
- Existing data values and settings behavior are unchanged. No production data is used in tests.

## Constraints

Use the main checkout, as requested after rebasing onto merged master. Follow package CLAUDE.md files
and the typed EARS checklist for touched signatures; change no typed-query behavior to satisfy a rename.
Use current npm scripts, not the retired build command. Do not edit archived historical documents.
Every newly enforceable rule has a firing case; semantic noun choices stay review guidance.

## Review evidence

- Phase 2: restored getter families (vaults, registries, EARS fields, editors, state/process accessors).
  Retained domain queries for documents, labels, search indexes, sessions and branch PRs, plus
  executeIfFound for the existing optional action execution. Function bodies and absence values are
  unchanged. All typechecks and public-report checks pass; rebuilt default-setup and passed its
  834 tests (two existing skips). The initial test used stale compiled actions; rebuilding fixed it.
