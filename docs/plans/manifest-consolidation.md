# Complete the manifest consolidation

Status: required, in progress. Reconciled 2026-10-14 after reference checkpoint `c776d1c5d`.

This restores unfinished outcomes from the [manifest redesign](../archive/goals/goal-manifest-redesign.md),
[convention-first plan](../archive/plans/manifest-convention-first.md),
[declarative contributions](../archive/plans/declarative-contributions.md) and
[facade naming](../archive/goals/goal-defs-naming.md). Archiving them did not authorize dropping their
requirements. This plan owns the remaining authored-manifest redesign; the
[execution goal](../goals/goal-settings-and-pack-contracts.md) owns commits and completion,
[manifest maturity](manifest-maturity.md) owns ordering, and [discovery](discovery-without-activation.md)
owns descriptors, bindings and consumers. Existing validated settings/reference work remains intact.

## Reconciliation of all 17 decisions

Evidence below is current source inspection, not a claim that historical test results prove completion.
A landed result still needs its applicable regression checks in the final requirement audit.

| Decision | Intended outcome and disposition | Current evidence and remaining acceptance | Checkpoint |
|---|---|---|---|
| 1 | Group by concern and write a stable, readable manifest. Required; replace the obsolete exact root-key count/order with ordering for the current schema. | Root `entities`, `entityShapes`, `relKinds`, `boot` remain in SDK `manifest-schema.ts`. CLI `add/manifest.ts:writeManifest` only stringifies insertion order. Centralize root/feature/extension field order; every authoring writer uses it. Preserve contribution-member and array order where it affects behavior. | M1–M6 |
| 2 | One module/export reference syntax. Required for shape references; retain objects that carry actual metadata. | `EntityShapeSchema` still has `{ source, type }`; `ExportTargetSchema` and component entry/load objects already exist. Replace shape pairs with `path#export`, share parsing/refusal, preserve named/default export semantics. Module-only type barrels must retain their explicit export-star semantics rather than pretend to be default value exports. | M1, M4 |
| 3 | Declare an entity and its shape once, under its owning feature or `data.entities`. Required. | Root identity/shape maps and structural `ProvenanceManifest.entities` remain. Add one normalized entity projection and migrate every reader, including native declarations, schema/Packs inspection and provenance. `null` explicitly means untyped; `SearchIndex`/`IndexedDoc` gain no shape. Keep compiled types flat and generated EARS wire identities and typed/untyped behavior unchanged. | M1 |
| 4 | Replace root relation identity maps with pack-level `data.relations` wire values. Required. | Root `relKinds` remains. Current schema checks names/values, so derive the same constants from the same wire strings. Prove generated EARS, relation types, collisions and dependency provenance unchanged. | M2 |
| 5 | Remove partition-policy machinery; proposed `volatile` addition needed a separate real storage requirement. Excluded under the settled storage scope. | The predecessor itself records removal and says not to add volatility without an actual need. Do not recreate it, widen entity values for it, or require its obsolete external-pack test. Retain existing storage behavior; general storage work remains separate. | Preservation |
| 6 | Designation is a role distinct from feature id, with collision checks. Landed; preserve. | `validate.ts:validateFeatures` checks role collisions without requiring equality; `FeatureEntrySchema.designation` is a string. Recheck nonmatching role/id, within-pack and cross-pack conflicts through actual registration. | M4/final |
| 7 | Explicit feature contributions, useful authoring layout and consistent type-module naming. The `provides`/inferred-existence mechanism is replaced, not its tool agreement. | Current keyed features and explicit targets are the authority. Retain pack-root-relative declared paths, ownership/import boundaries and named missing-target failures. Consolidate supported scaffold layout across add/doctor/validation/codegen/docs. Include the original `typesEntry` → `types` authoring rename, preserving type-barrel semantics. | M4 |
| 8 | Avoid duplicate contribution existence and meaningless annotations. Replaced by keyed declarations with metadata and checked bindings. | Schema has explicit system/plugin/settings/reference declarations; no `provides` list is needed. Do not introduce boolean authoring placeholders. Early validation checks known declaration/export errors; runtime admission checks dynamic binding membership. Unused utility exports are not undeclared contributions. | M4/discovery |
| 9 | Contributions live under `extensions`; settle settings/help placement. Landed in part and deliberately redesigned. | SDK `ExtensionsSchema` has contribution fields, `extensions.settings`, `extensions.help`; host settings are independent. Preserve these and moved-root-key refusals. Full metadata/binding migration for remaining kinds stays required. | Discovery/final |
| 10 | Content is grouped and lifecycle has a coherent declaration. Content grouping landed; lifecycle root move required. | `ContentConfigSchema` groups sources/datasets/formats/writers. `BootConfigSchema` now declares `onInit`/`onShutdown` targets and host `declaration-binding.ts` checks exact functions. Use `lifecycle: { onInit: "path#export", onShutdown: "path#export" }`, replacing the historical opaque single-module proposal. Migrate discovery/codegen/native bindings; preserve actual execution/order and unchanged-content apply identity. | M3 |
| 11 | Schema assistance and public docs specify the supported contract completely. Required. | Many fields have descriptions, but nested reference/component fields still lack them. Require meaningful descriptions for every supported authored field, generated-schema coverage, useful completion/diagnostics and complete public docs. Describe explicit null/untyped behavior and published artifact layout. | M6 |
| 12 | Default selection belongs to its plugin, with uniqueness. Landed; preserve. | `PluginSchema.default`, schema refinement and generated plugin metadata hold the claim. No root `defaultPlugin`. Recheck duplicate local claims and documented cross-pack selection policy, not just schema presence. | M4/final |
| 13 | Every feature explains its purpose; scaffolding collects it and validation requires it. Required. | `FeatureEntrySchema` has no purpose field; `add/feature.ts` collects label/icon/designation. Use required nonblank `description`, consistently through authored/native declarations, scaffold, catalog and inspection. Do not resurrect `about` as an alias. | M4 |
| 14 | Delete unused `$manifestVersion`; preserve artifact-format policy and release metadata. Required. | Schema still accepts it. Remove it outright. Existing snapshot/layout constants are 1/2 and must remain unchanged. Audit exact supported layout validation: `layout.ts` and `assets.ts` still use `Math.floor`. Reject malformed/fractional stamps without altering facade capability acceptance or introducing another manifest version. | M5 |
| 15 | Finish deliberate naming now; preserve release discipline. Required maintenance, not blanket renaming. | Completed naming baseline `3d389b9c8` remains authoritative. Resolve the two questions below explicitly. Document later breaking/additive evolution against current artifact contracts; no release/version edits in this goal. | M4–M6/final |
| 16 | Change all owned contracts together without compatibility. Required throughout. | Root CLAUDE prohibits aliases, dual reads and obsolete-format conversion. Cover loosely typed readers and all native/source/installed shapes, authoring tools, fixtures/templates/docs; developer backup work remains separate. | Every checkpoint |
| 17 | Build options and check allowances have one authored manifest, no sidecars. Build landed; checks required. | `build.bundleUi`/`opaqueDeps` exist. CLI `pack-rules.ts` still reads `apack.checks.json`. Move allowances to `checks.allow`, retain unknown/non-switchable rule refusals and switchable-set guidance, remove the file reader and all scaffolds/examples. | M5 |

## Resolve the two naming questions

- **`extensions.fe` → `extensions.frontend`: selected.** `FEConfigSchema` still groups editor/app
  contributions under `fe`. Spell out the public container as those kinds become declarative in the
  discovery checkpoint. Keep `fe`/`be` directory conventions, established facet keys and useful API names;
  this is not a blanket abbreviation ban. All readers/schema/examples change together, with no alias.
- **Keep `hostVersion`: selected.** This field constrains one host's semver range, whereas package
  toolchain engines and declared API/provider dependencies are different contracts. Current schema,
  compatibility diagnostics and naming use the host concept consistently. Do not add an `engines`
  wrapper or silently defer the question again.

These choices settle the old questions in context; they do not reopen the completed naming goal.

## Account for the original phases and their checks

| Original phase | Successor outcome and required evidence |
|---|---|
| 1 — data | M1/M2 consolidate entities/shapes/relations; M5 deletes the manifest format key. Pin the before state and compare generated EARS identities/types and typed/untyped/editor-completion behavior. Validate duplicate entity homes naming owners; missing shape exports naming entity/path; cross-pack collisions; feature-only Packs counts and dependency provenance. Mutation-check the two loosely typed readers so an empty result cannot pass. The volatile/storage additions are explicitly excluded above. |
| 2 — extensions | Preserve landed grouping plus settings/help redesign. Discovery finishes remaining declarations, not historical barrels or implicit existence. Moved-key refusal and every external/native contribution kind remain in acceptance. |
| 3 — lifecycle | M3 replaces `boot` with checked declarative `lifecycle`, preserves migrations as their own key and actual hook order. Compare compiled content bytes/identity before/after the syntax-only move and prove ordinary build/install/boot does not reapply unchanged records. |
| 4 — features | M4 adds required descriptions, preserves designation/default claims, settles `types` and shared authoring layout. Discovery's explicit targets replace `provides`/feature-relative inference. Named missing-target, ownership/path-escape, duplicate claim and scaffold/doctor/codegen agreement checks remain. Compare generated behavior, not necessarily obsolete registration bytes whose metadata intentionally changes. |
| 5 — references | M1/M4 use one target parser for genuine module/export references. Reject `path#` and `#export` with useful path/name diagnostics. Retain loading/component/contract metadata objects and type-barrel semantics; no `{ source, type }` shape encoding remains. |
| 6 — schema/docs | M6 descriptions/completion/diagnostics, artifact-layout docs, current manifest documentation and canonical writing. All add/init writers preserve the supported field order, not just insertion order. Do not restore an obsolete root-key count containing `builtIn`/old keys; reject unsupported keys and maintain current schema/order checks. Leave historical examples unchanged except successor notices. |
| 7 — build/checks | M5 places allowances in `checks.allow`, removes sidecar reads and preserves actionable non-switchable/unknown-rule refusal. Real bundled-UI and packaged/external authoring checks remain required. |

Preserve the original end-to-end validation obligations through current commands: affected schema/API/
facade reports, typed EARS/completions, unit/integration checks, actual external app and packaged-authoring
acceptance, and final strict `--all` on committed source. No historical `npm run build` alias is restored.

## Additional consolidated requirements

These are completion obligations, not optional later improvements.

| Source outcome | Implementation owner and acceptance |
|---|---|
| Flow/action dependency edges and rename-side checking | Discovery content inventory: expose stable action identities and each statically knowable flow reference, detect a renamed/missing action from both sides, and represent dynamic references honestly. Do not invent guessed edges or a second authored inventory. |
| Manifest-only rewrites do not reapply content | M1–M5: pin compiled content bytes/identity and ordinary apply behavior before each syntax-only migration; changed declarations/bindings may change, unchanged content may not. Intentional source changes remain separate. |
| `apack pack info` lists actual contributions | Discovery CLI checkpoint: real compiled identities/labels, including a source-file count different from output count. Source/unbuilt/failed availability is explicit; no silent file-count substitute or executable imports. `info.ts` currently counts `.ts` files. |
| Shared authoring/validation/doctor/codegen/layout docs | M4/M6: explicit declarations determine existence; supported scaffold conventions have one shared definition. Validate their declared targets and ownership, doctor diagnoses the same targets, and a regression checks documented layout against the actual authoring contract. |
| Early refusal of statically undeclared/missing contributions | M4/discovery: `pack validate` names declaration/export errors knowable without executing the pack. Keep runtime exact-membership validation for dynamic bindings. Never execute a pack to satisfy the early check or reject unrelated utility exports. |
| Facade terminology | Discovery/dependency checkpoint: `PackSnapshot.facades`, `PACK_TYPES_FACADE`, cache `facades/` and matching summaries/diagnostics/docs; keep DSL `defs`. SDK `manifest.ts`/CLI `fetch-deps.ts` still use the old facade names. |
| Required facade contracts | Same checkpoint: a missing/incapable required facade fails naming dependency/rebuild remedy, without silently dropping typing. Preserve acceptance based on capabilities; missing/different recorded format and SDK version remain diagnostic context when capabilities suffice. Retain structural/cache/refusal regressions and actual dependent/external authoring checks. |
| Declarative contribution core | Discovery retains exhaustive kind/consumer classification, compiled static metadata, checked bindings, ownership, poisoned executable dependency tests and zero activation/user-data writes. No second inventory, `provides` or implicit existence. |
| Settings, APIs, navigation, boundaries, replacement | Their active plans and every existing execution phase remain required. This reconciliation adds missing obligations; it does not discard existing work or certify it complete. |

## Execution order and checkpoint boundaries

1. **M1 — entity ownership and shape references.** Read TYPED-EARS before touching controlled types;
   pin generated EARS/content/completion evidence. Introduce `features.<id>.entities` and `data.entities`
   as `name: "path#export" | null`. Add the single normalized reader; migrate structural/provenance and
   native/catalog/schema/CLI/scaffold/runtime consumers, including those the compiler cannot catch.
   Duplicate homes must be refused before publication; a deterministic normalization must not conceal
   an invalid declaration. Paths remain pack-root-relative; ownership does not qualify wire names.
   Shapes are exported TypeScript types checked at build time with purpose-specific validation through
   the common reference parser, never executable bindings. Installed/offline discovery requires neither
   authored source files nor executable imports. Snapshot entity/type publication stays flat.
   Preserve EARS behavior; declaration grouping may change inert generated ordering. Compiled content
   bytes and apply identities must remain unchanged. Commit validated source/evidence.
2. **M2 — relations.** `data.relations` holds stable wire values, generated constants retain their names.
   Preserve EARS identities/types, dependency diamonds, collisions and actual external runtime relationships.
3. **M3 — lifecycle.** Reuse current explicit hook targets and checked membership under `lifecycle`;
   keep no opaque aggregate thunk/module discovery. Preserve hydration/migration/apply/shutdown order,
   resource cleanup and content apply identity. A manifest root rename need not rename every useful
   internal registration/runtime type; document the boundary explicitly.
4. **M4 — feature purpose and authoring contract.** Require descriptions, settle the feature `types`
   module syntax from its actual export-star reader, shared scaffold/layout/target resolution and early
   validation boundaries. Preserve roles/defaults and explicit existence. No generated inference.
5. **M5 — checks and format cleanup.** Embed allowances, delete sidecar reader and `$manifestVersion`,
   preserve format constants/release metadata, and check exact layout acceptance independently of facade
   capability checks. Each logical change can be its own validated commit.
6. **M6 — canonical writing and schema/docs coverage.** One stable writer across init/add/edit paths;
   complete descriptions and editor assistance for the final supported contract. Test preservation of
   meaningful record/array order and document native/installed/shipped artifact differences.
7. **Resume full discovery and remaining phases.** Include the selected frontend container, facade
   naming, content dependency graph, CLI inventory, intrinsic editor-schema ownership, every remaining
   kind/native/freshness check, entity navigation, boundaries and all three Phase 6 workstreams.

Run focused checks and strict checkpoint validation before each source commit, then record separate
owning-goal evidence before moving on. No compatibility, production-data operations, version bumps,
publishing, PRs or pushes. Lazy activation, strong isolation and general storage remain deferred/separate.

Tracking repair does not finish this work. Closure requires implementation and acceptance evidence for
every active row above and every original goal requirement. Preserve unrelated draft documents.
