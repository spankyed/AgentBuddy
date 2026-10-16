# Discover every declared contribution without activating a pack

Status: implementation in progress. Written 2026-10-12 on `AS/feature-settings-rework`.

This is the discovery workstream of [manifest maturity](manifest-maturity.md). It builds on the
[settings extraction](settings-architecture.md) and replaces the older
[declarative contributions plan](../archive/plans/declarative-contributions.md) as the target for complete discovery.
The older inventory remains historical evidence. This plan owns the current implementation target;
[manifest maturity](manifest-maturity.md) records decisions transferred from the other archived designs.
The [naming contracts goal](../archive/goals/goal-naming-conventions.md) is complete. Re-audit code
names on that result rather than applying the old naming survey or renaming a surface twice.

## Goal and boundary

Every supported contribution can be listed, described, addressed and checked for declared compatibility
before any executable pack module loads. This applies to installed packs and their dependencies, whether
enabled, disabled or not yet activated.

Complete discovery means discovering the supported declaration contract. Arbitrary JavaScript behavior,
successful execution and current results from dynamic providers cannot be inferred from declarations.
Make those runtime responsibilities explicit rather than hiding a discovery-time import behind them.

Discovery reads validated data files, static assets and host-owned state such as installed versions.
It does not import/require pack or dependency modules, instantiate components or actors, run hooks,
execute migrations/content appliers, query a pack's live provider, or write user data. Build-time compilers
may execute code; their discoverable results must be materialized before installation.

## Current discovery checklist

Current status audited 2026-10-15. This checklist owns discovery progress; the execution goal owns
phase ordering and final acceptance. Update these rows as checkpoints land rather than copying a new
remaining-work list into each checkpoint. Source commits in the checklist and evidence record establish implemented slices, not
completion of the whole plan. Compiler capture/session ownership landed in `aba660aed`; its checkpoint
strict run passed (29 executed, one cached), including all 744 integration cases. Frozen pack/external
inputs, complete build-session lifetime and whole-build freshness remain unfinished.

Execution follows the goal's [live ledger](../goals/goal-settings-and-pack-contracts.md#live-execution-ledger-reconciled-2026-10-16)
and [bounded validation](../../CLAUDE.md#keep-validation-bounded). Diagnose a failed assertion with its
preserved evidence and targeted reproducer; do not restart the broad chain after every local fix.
Broaden only to close a stated coverage gap or run the required converged gate. Keep checkpoint claims,
unresolved acceptance and unrelated infrastructure defects distinct. No deadline increase, weakened
assertion or repeated green focused run substitutes for the required gate. The compiler checkpoint is
committed. Use the ledger's per-deliverable dependencies: independent installed-data readers may
advance while the unfinished producer/freshness workstream remains required.

Source `37890aa9b` now installs native input capture before worker preloads and adopts it during
compilation. It observes existing loader threads through a coordinator without adding source hooks or
changing measured preload order. Cached filesystem APIs share the same capture owner, and final
validation includes loader facts. Source `65a189cb7` adds ordered effective execution options and the full runtime version map to the
compilation key. Source `3929897a3` captures that identity before user preloads can rewrite ambient
values. The worker inherits `NODE_OPTIONS` and custom export conditions; supervisor entry modes are
not implicitly worker configuration. Immutable executable/native runtime ownership, source/dependency
snapshot ownership, retained frontend lifetimes and persisted receipt/passive freshness remain required. Source
`bbf05ec00` captures authored bytes and file membership before preloads, and discovery reuses that
inventory. Consumed namespace queries still have their existing owner. Declared dependency capture,
late external inputs, cross-thread coherence and derived-output ownership remain unfinished; the goal's
live ledger owns execution order and the checkpoint evidence record contains exact claims. Source `c85fc178a` removes repeated identical-path projections during native input materialization;
the previously failing focused watch publication/refusal/repair scenario passes. The latest strict
run remains failed, and this focused result does not establish pooled acceptance.
The goal's live ledger owns current acceptance and next work. Keep all remaining discovery
and downstream requirements active; no timeout/assertion adjustment or broad diagnostic rerun is implied.

**How to read the history:** dated audits, designs and checkpoint handoffs in [the evidence record](../evidence/discovery-without-activation.md) record what was known
at that time. Their “remaining,” “next” and “not yet implemented” statements are superseded for current
status by this checklist. Preserve their evidence and unresolved acceptance requirements; supersession
does not waive a requirement. The acceptance section remains normative. An old failure log is neither
proof of a current failure nor proof that the failure was subsequently fixed.

| Consumer / contract | Current status and source evidence | Remaining acceptance |
|---|---|---|
| App, pack-group and feature settings | **Implemented, awaiting final acceptance.** `f3416ad2f` connects definitions and runtime settings to the catalog; later settings checkpoints record caller, form and window behavior. | Reconfirm the settings plan's complete three-owner, disabled/failed pack, policy, reset/import and multiple-window checks on final committed source. No new settings extraction is required. |
| Help listing and articles | **Implemented, awaiting final acceptance.** `2169d29f8` moves help into snapshot/catalog data; the help publication/browser-routing checkpoint in the evidence record records disabled-pack navigation and publication checks. | Include poisoned executable entries, invalid replacement retention and disabled help navigation in the final all-kind acceptance. Preserve the separately recorded concurrency failures until current evidence resolves them. |
| Installed-pack information | **Implemented, awaiting final acceptance.** `6c876c9ba` uses accepted declarations plus installation/activation records. | Prove disabled/failed/unreadable installations and refused replacements remain explainable without executable imports. Check offline CLI inspection alongside app information. |
| Reference metadata, parsing and picker categories | **Implemented, awaiting final acceptance.** `20ab75efe` migrates editor consumers/provider scopes; `c776d1c5d` preserves wire identity without metadata. | Reconfirm delayed/missing catalog delivery and source-free discovery; categories must start no providers. Actual queries/navigation still require eligible bindings and disposed provider scopes. Entity destination redesign belongs to Phase 4. |
| Live editor contribution composition | **Implemented, awaiting final acceptance.** `8863043a6` adds accepted-change subscriptions and generation-checked replacement. | Complete cold-document/provider readiness checks and real typing during contribution replacement; preserve pending content, selection and lifecycle cleanup. This does not complete DSL assistance below. |
| Step palettes, styles, defaults, layout and backend metadata | **Implemented, awaiting final acceptance.** `76df2f0e5` migrates frontend readers; `71fad4013` backend defaults; `8ec5285ed` trigger/build declarations; `f7d63434c` update eligibility. | Include authored and native steps, inactive metadata, external runtime paths and stale binding refusal in final acceptance. Keep actual flow execution bound to its accepted runtime lifetime. |
| Shell navigation/default selection | **Default/dispatch and navigation metadata implemented.** `cfcbb53f9` moves toolbar/menu/keyboard inventories, labels, order and visibility to declarations and removes backend runtime visibility copies. `69860e4be` selects defaults from declarations, uses checked owner/build/runtime plugin bindings for new navigation/delivery, preserves native host availability and reconciles frontend-before-frame ordering. The runtime default selector is removed. | Complete loader coordination cleanup and final real-window navigation acceptance. Preserve saved/popout/explicit precedence, unknown/disabled/loading/failed distinctions, actor-event readiness and stale completion refusal. `wantsDefaultPlugin` still records user intent; `pendingPluginId` and request queues retain actual readiness work. |
| Declared slash-command listing | **Implemented, awaiting final acceptance.** `ff48438cd` projects native/installed/source commands through the common catalog in stable admission order. SDK execution selection matches enabled declarations to accepted runtime identities; the old command store is removed. Chat subscribes to catalog changes and retains user-content/runtime notifications. | Include this metadata/eligibility split in final all-kind acceptance. Focused checks cover poisoned source-free inspection, inactive/stale/build-replaced owners, collisions, ordering, real pack refresh and actor stop. User-document precedence and user.command flow dispatch remain unchanged. |
| Block and artifact metadata | **Consumer checkpoint implemented.** `3e4e10c8f` publishes native/installed/source metadata; `a278d4116` adds checked frontend bindings and scoped catalog readers, migrating thread icons, input kinds and components together. Mounted views follow independent catalog/binding changes and refuse stale implementations. Backend transcript callbacks remain execution. | Finish the all-kind audit, including backend/native fields and superseded metadata readers. Active low-level registries retain runtime lookup lifetimes; do not count them as static discovery. Keep source-free installed inspection and ownership/readiness checks in final acceptance. |
| DSL/editor assistance | **Implemented, awaiting final acceptance.** `8ed188046` publishes compiled text and `39e48e66e` / `eb7d0995b` migrate SDK/Monaco to static catalog data with shared owned libraries and live replacement/removal. The frontend registration/store, generated raw module and staged-import resolver are removed. `07d544606` supplies offline Monaco. | Complete real worker/cold-document/window acceptance with the all-kind gate. Focused TypeScript completions, shared consumer disposal, prefix policy, two full deterministic builds, source-free disabled installed data and shipped-pack build pass. Preserve the existing five-build timeout for B6; its full frontend reuse/removal acceptance is still required. |
| Compiled-content inventory and dependencies | **Partially implemented.** `7196d61d3` publishes flow reference fields/targets in the verified content index; build-only codegen, offline inspection and known incoming-edge queries cover nested/custom/computed targets. | Audit every inventory reader and close flow-edge acceptance. Preserve explicit unavailable/non-exhaustive analysis and indexed-target semantics; finish all-kind external/installed acceptance. Distinguish declared content from rows created by appliers; no user-data writes during inspection. |
| Services, repositories, events and remaining native contributions | **Partially implemented; field-by-field completion audit outstanding.** `506582b94` adds native service/repository ownership data and common native/authored binding-name validation; shared catalog and generated contracts exist. | Classify every supported registration field as discoverable data or executable binding, including nested members and static assets. Discover contracts without constructing services. Verify ownership/collision rules and native/authored parity; do not infer completion from schema acceptance. Phase 6 owns consumed-API enforcement. |
| Shared readers and all-kind acceptance | **Partially implemented; final consumer audit outstanding.** Snapshot/catalog admission is shared; individual migrations above have checkpoint coverage. | Recheck lifecycle, offline database schema, CLI inspection and refresh subscriptions for duplicate parsing or active-only inventory. Preserve each consumer's enablement/execution policy. Exercise every supported kind with poisoned executable entries, source files absent, disabled/failed owners, collisions and atomic replacement; remove superseded discovery stores without deleting real runtime machinery. |

The partial rows identify inspected gaps; they are not claims that every caller in that family has
already been audited. Closing a row requires its source commit and acceptance evidence, including deletion
of superseded discovery projections. A passing producer test alone does not establish consumer migration.

### Build freshness has per-consumer dependencies

Archive creation, prebuilt tests, default-pack fork preparation and drive are **build-freshness
consumers**, not additional discovery UIs. Their common input/publication contract and migration remain
required under [content-based source freshness](../evidence/discovery-without-activation.md#required-content-based-source-freshness-correction-2026-10-15).
Shared authored inputs landed in `882d2a50b`; compiler capture/session reuse landed in `aba660aed`
after strict checkpoint validation. Captured TypeScript query views and retained read-set validation land
in `e171b3acf`, with full checkpoint evidence in the evidence record. Frozen pack/external inputs, whole-build input/output association and the
passive freshness authority remain unfinished. Installed/offline discovery must continue to need
neither authored source files nor compiler activation.

The execution goal owns the current order. Only consumers requiring an unfinished producer guarantee
wait for that guarantee; installed-data readers and entity navigation may proceed on their accepted
catalog/binding contracts. Complete the freshness workstream and all-kind acceptance before final
closure. Pane/form containment is locally accepted in `713a6c1fd`; retain its final checks. All three
Phase 6 workstreams remain required.

### Remaining registration audit (2026-10-16)

This inventory follows `PackRegistration`, `PackFeature`, `PackFERegistration` and `PackFEFeature`
as implemented now, not the original survey. Existing declarations are retained; a runtime lookup is
not a discovery defect when its caller needs an executing implementation.

| Registration field | Static authority / binding boundary | Current finding |
|---|---|---|
| `id`, `declarationRevision` | Accepted snapshot/native owner; installed runtime revision checks in `declaration-binding.ts` | Implemented. Native composition has no installed revision. |
| `name`, `dependencies` | Authored manifest; native declaration has dependencies | Native display name is not represented. Audit actual display readers before deciding whether to add native metadata or remove redundant binding data. |
| `features` membership | Manifest/native keyed features; backend and frontend admission | Both admit against declarations; native backend nested checks remain incomplete below. |
| `features.*.designation` | Feature declaration; runtime designation lookup is execution | Authored backend and shared frontend compare it. Native backend does not; its test fixture also drops it. Required repair: refuse changed/added/omitted claims atomically and preserve declaration data after unload. |
| `features.*.system.machine` | Authored `system.entry`; executable machine remains activation | Native feature declarations omit system presence entirely. Required native metadata and binding checks must preserve the host's actual composition rather than invent a frontend pane. |
| `features.*.system.receives`, `features.*.plugin.receives` | Generated contract event names; backend validation maps consume running bindings | Generated entries contain event names, but the snapshot has no compiled event inventory. Native declarations have neither. Required: materialize checked endpoint contracts and inspect them without importing modules. Keep native shell inboxes distinct from contributed UI plugins. |
| `features.*.services`, top-level `services`, `repositories` | Manifest/native named targets; `apiBindingProblem` checks ownership and membership | Implemented names/owners; constructing objects and calling methods remain execution. Phase 6 owns consumed API enforcement. Verify source-free inspection and collision acceptance rather than replace their runtime stores. |
| `settings`, `features.*.settings` | Inline schema/defaults; shared catalog projection and binding equality | Implemented. Retain disabled/failed-owner definitions and current policy semantics in final acceptance. |
| `bindSettings` (both registrations) | Generated caller authority setup/disposal | Executable resource acquisition, not a discoverable contribution. Keep its rollback and retirement. |
| `ears.entities`, `ears.relKinds` | Shared normalized `data`/feature entities and `data.relations` | Implemented typed/untyped wire projection; runtime registration checks authored/native equality. Runtime EARS registration remains execution. |
| `lifecycle` | Explicit hook targets, checked callable bindings | Implemented authored/native metadata and membership checks. Running hooks is execution. |
| `migrations` | Authored line/target/description/`up` declarations; checked backend bindings | Authored implemented. Native declaration omits migrations while native backend registration accepts them unchecked. Reconcile native support, then check it without running `up`. |
| `steps` (both registrations) | Snapshot/native step declarations and catalog projections | Implemented metadata and checked facets. Keep handlers, compilers, live labels/layout and trigger resources executable; include native and external paths in final acceptance. |
| `artifacts`, `blocks` (both registrations) | Snapshot/native declarations; frontend checked components; backend authored membership/kind/facet checks | Native backend does not run the authored artifact/block checks. Required parity for declared identities and backend facet membership, preserving runtime callbacks. |
| `contentWriters`, `appliers` | Authored `content.writers` and `content.sources`; compiled content index | Authored bindings checked. Native registration accepts these without matching native declarations. Resolve this alongside native migration support, retaining real content execution and runtime teardown. |
| `commands` | Native/authored keyed metadata and catalog order; runtime selection checks accepted identity | Implemented; preserve document-command precedence and global dispatch behavior. |
| `features.*.plugin` (frontend) | Plugin declaration plus compiled destination claims; checked binding/catalog eligibility | Implemented. Backend inbox metadata is a separate transport concern; the host application actor has an inbox without a contributed sidebar pane. |
| `features.*.references` | Declared type/category metadata and checked provider/icon bindings | Implemented; no navigation callbacks. Provider results remain executable. |
| `features.*.settingsForm`, `settingsForms` | Declared custom-form targets and owner settings | Implemented checked components and scoped failure boundaries. |
| `features.*.designation`, `features.*.default` (frontend) | Feature designation and plugin default annotation | Implemented shared native/authored comparison; do not restore runtime discovery tables. |
| `tiptapPlugins` | Named group/member targets and catalog metadata | Implemented checked extension names, popup membership and predicate presence; running editor extensions remains execution. |
| `appExtensions` | Named targets and checked components | Implemented metadata; shared slot selection retains existing composition policy. |

Other authored/static surfaces remain part of the same audit: help's built documents, DSL's compiled
definitions, compiled-content indexes/flow edges, public type facades, source formats, plugin component
targets, frontend entry/CSS and lazy chunks. Snapshots carry declarations/compiled data; the installed
asset receipt verifies shipped files. Do not treat module target strings alone as proof that a required
asset is present, or an unavailable source-only projection as an empty compiled inventory. Existing
`readPackBuild`, help/DSL validation and content-index readers are the owners to extend where a
specific missing asset or reader is demonstrated.

Execute the identified gaps in this order:

1. Repair native designation comparison without expanding its contract. Prove refusal and rollback
   before proceeding; migrate the native test fixture's declaration projection with it.
2. Settle one compiled endpoint-contract projection for authored and native contributions. Reuse the
   generator's existing contract reader; compare bound event memberships at admission. Static inventory
   does not authorize a sender or activate an actor. Preserve the native shell inbox/UI distinction.
3. Close native backend contribution parity for migrations, content writers/appliers and artifact/block
   facets. Reuse shared binding checks instead of growing a second native validator. Any unsupported
   native slot must be explicitly absent from the supported contract and refused, not silently ignored.
4. Finish native name/static-asset and remaining consumer checks, then all-kind source-free/external
   acceptance. Record which asset classes and entry kinds the checks actually exercise. Keep B1–B6 and
   Phase 6 enforcement in their existing execution slots; this inventory does not reopen them.

No completion is claimed from this table. It identifies inspected implementation, concrete omissions
and the bounded checks needed to close them. Historical checkpoint evidence is not a second backlog.

## Architecture

```text
Author declarations + source/content
                 |
               Build
                 |
Complete descriptor + static data/assets + executable builds
                 |
       Host contribution catalog
                 |
       Activation binds implementations
```

### One generated descriptor, extending the snapshot

Extend the existing snapshot to carry normalized discovery metadata. Resolve local metadata/data files
at build time, qualify owner identities and embed or index the required static files. Use symbolic
icon names or asset references rather than Vue component objects. Publish generated contracts without
requiring readers to execute their source modules.

The author declares a fact once. Codegen derives the descriptor and runtime binding from that declaration;
do not copy labels/defaults into both a plugin object and a manifest. Where metadata currently comes from
executable exports, move its authoring location to data rather than try to evaluate arbitrary functions
at discovery time. A typed source definition can remain build input only if its descriptor is generated
before installation and there is no independent runtime account of the same metadata.

Read descriptor/data references within the installed build and verify them under the existing integrity
contract. Reject unsupported formats, missing required assets and inconsistent identity with actionable
diagnostics. Do not fetch or execute missing dependencies just to list what is installed. Source-checkout
inspection may expose unbuilt/incomplete status, rather than activate the source to fill gaps.

### Static help data checkpoint

Materialize help in `PackSnapshot.help` from its Markdown data source during build. It is required when
`extensions.help` is declared; absence means no declared help contribution, not an old-format fallback.
Validate document fields, local IDs, uniqueness and feature ownership before admitting the snapshot.
Remove help from backend registration/codegen and retire its runtime store. The existing contribution
catalog qualifies and sorts articles for installed packs, including disabled or activation-failed ones.
Source declarations supply explicit help data; source tooling may parse Markdown data,
but discovery never imports a pack module to fill it. Native all-kind descriptor ownership remains a
required checkpoint; the host currently declares no native help articles. Source declarations with unmaterialized declared
help report that incompleteness rather than silently pretending the pack has no articles.

Use one general catalog-change subscription for data consumers. The Help system follows that resource,
not PACK_CHANGED activation events; settings follows the same catalog through its existing projection.
Prove readable help with poisoned executable entries, disabled packs and atomic invalid updates, then
verify actual help navigation and source/built authoring. This checkpoint does not replace the required
plugin/step/reference/editor/hook metadata and frontend binding work.

### A catalog separate from running implementations

Introduce a host-owned catalog over the validated installed descriptors and resolved dependency graph.
Expose it to the renderer as data. Listing, navigation, settings, help, palette metadata and compatibility
inspection use that catalog, not the executable registration stores.

Keep these facts separate:

- Declared: the descriptor contains the contribution.
- Eligible: host compatibility, dependencies and enablement permit its use; otherwise give a reason.
- Active: its implementation is loaded/running, or failed with an activation problem.

Discovery does not require activation. Opening a custom form or executing a command may require it.
Data-only settings remain inspectable/validated while a pack is disabled; forms follow the settings plan.
Refresh the catalog on install/update/removal and dependency changes without creating runtime actors.
Keep stored overrides and other user data outside the catalog.

### Authoritative declarations and checked binding

The validated backend/content checkpoint checks backend feature identities, designation values, system/plugin
presence, plugin default visibility, per-feature service names, and the aggregate provided-service and
repository names against the accepted manifest. Both installed loading and direct origin-bearing
registration perform this check before registry mutation, catalog publication or settings authority
binding. A matching declaration stamp alone did not enforce this membership. Installed test builds
must declare the contributions they actually bind; do not infer manifest facts by executing their runtime.

The integration gate confirmed a facet mismatch in the testing harness: content-only runtimes were
adapted into full backend registrations. Settle two explicit operations instead. Backend registration
binds the manifest's systems, plugins, roles and services. Content registration binds only the generated
content runtime's own entities, relations, repositories and writers, with optional declared appliers;
it activates no actors and claims no backend services. Both retain the same accepted declaration identity,
owner and catalog data, and share registry collision, rollback and teardown machinery. Do not add a
skip-validation flag or manufacture missing actors. Move the producer's `ContentRuntime` contract to
SDK framework ownership, remove the harness's fake backend-registration assembly, and check content
identity/membership through a separate registry operation. Backend integration fixtures must also declare
their hand-written systems/plugins rather than adding them only in test setup.

The next working extension checks backend entity/relation values, writer/applier identities, step,
artifact and block type membership, command names/placeholders, migration lines/targets, and hook-module
presence. It checks step runtime flags and handler presence and refuses frontend facets in backend
bindings. Missing/extra/duplicate arrays and explicit malformed values are refused before registration.
Help bodies, migration descriptions, hook export availability and other hidden module metadata still
require materialized descriptors; do not infer them by activating a pack during discovery.

The migration producer must bind explicit fields rather than spread the exported object: target comes
from the manifest, description is read from the source object, and calling `up()` retains that receiver.
Spreading allowed an extra target to overwrite the manifest and dropped class prototype methods.
Generated import paths must be relative to the actual generated directory, not computed by stripping an
assumed `src/` prefix. A bundled generated-entry regression exercises a root-level migration instance,
checks the authoritative target and executes its receiver-dependent method.

This is partial binding coverage. Remaining kinds, static metadata/assets, generated event contracts,
frontend membership and the native host declaration inventory still need their own checks and catalog
projections. Do not call a matching key set a proof of an executable object's full contract, or describe
this backend check as complete discovery without activation.

Activation binds implementations to catalog entries. The runtime cannot silently add an undeclared
contribution or redefine static metadata. Check the identity and shape of bindings when loading, retaining
the existing rollback mechanism for failures. A mismatch is an activation error, not a discovery mutation.

Preserve each extension point's actual ownership policy. Some names are exclusive; step facets and other
shared contributions may compose. Discovery must show all owners and the applicable conflict/merge policy,
not flatten them with last-wins provenance. Handle shared transitive dependencies once by identity.

Use generated bindings as the supported registration path; migrate all in-tree manual callers/fixtures.
This is a consistency contract, not proof that in-process pack JavaScript cannot perform unrelated side
effects. Do not claim that a descriptor proves a handler is safe or will run successfully.

## Dynamic behavior remains executable

| Discoverable fact | Runtime result |
|---|---|
| Reference category, provider contract and owner | Current matching items from that provider |
| Step type, static label/defaults and available facets | Label/layout computed for a particular live node |
| Command identity and contract | Its outcome |
| Migration line, target and description | Whether it succeeds and which rows it changes |
| Custom form/pane presence and source binding | The rendered component and state-dependent visibility |
| Content index and compiled entries | User-specific rows produced by an applier |
| Declared API/dependency requirements | Availability of an external service during a call |

Represent provider presence and requirements in the descriptor even when its results require activation.
Static UI eligibility may use host-known data. Arbitrary pack predicates stay executable; discovery must
not call them. Do not add a general expression language merely to disguise runtime behavior as metadata.

## Refactor the consumers, not just the manifest

These migration designs retain their behavioral requirements. Their present-tense code descriptions
were written before subsequent checkpoints; use the [current discovery checklist](#current-discovery-checklist)
to distinguish landed migrations from outstanding ones. In particular, settings, help, pack information,
reference/editor readers and step palettes are no longer wholesale pending migrations.

Audit performed against the current checkout on 2026-10-12. The catalog must replace the machinery
that reconstructs declarations from running code. Adding a catalog alongside that machinery would leave
two accounts of the same facts and retain the startup races this boundary should remove.

### Settings: remove the installed/registered union

`packages/apack-host/src/packs/registry.ts` currently combines `registeredSettingsRefs()` with
`installedSettingsRefs()` for `featuresWithSettings()`. The installed half parses manifests separately
through `manifestSettingsRefs()` and caches against `packsDirStamp()`. It discovers a disabled feature's
identity, but not its executable schema/defaults. A directory timestamp also does not describe changes
inside an existing pack directory.

Replace this union and its filesystem/cache helpers with catalog settings declarations. Remove the
registry's `installedPacksDir` option if no other caller needs it. In `backend-extensions.ts`, retire
`createSettingsDefaultsStore()` as an activation-owned contribution store: compose and validate defaults
from the settings catalog instead. Keep settings revision/subscription behavior, sourced from committed
declaration changes rather than register/unregister. Activation alone must not remove defaults or change
effective settings. Enablement/visibility policy is separate, as specified in the settings plan.

`packages/renderer/src/views/settings/canvas/tabs/FeaturesTab.vue` filters `allPlugins` by
`plugin.settings`. Replace that list with declared settings owners, including features without a plugin.
Resolve a custom component through the executable binding only when rendering it; show unavailable forms
without hiding the declaration. Move `application/be/system.ts`'s default visibility read off the runtime
settings store too. Keep the settings service, override storage, write correlation and live change delivery;
those implement behavior beyond discovery.

### Pack information: stop using registration as an inventory

Implemented in `6c876c9ba`: `toInstalledPackSummaries()` reads accepted catalog declarations,
joined to host-owned installation records, activation diagnostics and applied-content offers.
Disabled packs retain features, provided services, extension keys, migrations and hook presence.
Frontend availability comes from the accepted asset receipt. Refused replacements retain accepted
metadata; unreadable installations remain visible with a refusal and no invented version.
Catalog diagnostics publish atomically before listeners, without replacing unchanged settings definitions.

Separate pack information types from the runtime registry module. Keep declared, eligible and active
states explicit; frontend and backend outcomes may differ, including between windows. Do not turn the
catalog into another persisted installed-packs list: directories remain installation evidence and
`installed-packs.json` remains the side table for user choices/update provenance.

There is a runtime caller to migrate before deleting `getPackExtensions()`:
`runtime/lifecycle.ts::teardownPack()` uses its systems list. Use the existing
`getRegisteredPackSystemIds()` for teardown, because stopping systems means stopping actual bindings,
not every declared system. Keep `loadedPacks()` for genuine execution callers where needed; replace only
its use as the source of discoverable metadata.

### Shell: separate known navigation from frontend readiness

Checkpoint `69860e4be` moves default selection and destination eligibility to the catalog. The host
and window share plugin projection; local native host declarations are available before a connection.
Checked plugin bindings retain the captured declaration and accepted backend build/runtime identity.
The first-registered default table and its SDK lookup are removed. Enabled native default claims
precede installed claims, then fully qualified feature refs sort in English lexical order, independent
of frontend delivery. A saved selection, popout target or explicit navigation wins over the default.
A default is rendered only after its actor exists.

Unknown destinations refuse once the catalog is ready. Disabled, source-only, unavailable and failed
providers have distinct refusal paths. Known providers retain actual actor-readiness waiting and
request correlation. A catalog frame can reconcile an already-admitted frontend; stale completion and
replacement-gap dispatch cannot replace or reach an incumbent actor. Scoped catalog subscriptions
are released on shell stop. Native host Settings remains accessible while external declarations load
or disconnect. These are checked implementation claims; final goal acceptance remains outstanding.

Remaining: move sidebar/menu inventories, labels, declared visibility and navigation order to metadata,
joining readiness for actual rendering. `context.plugins` remains the active implementation/actor
inventory. Keep `wantsDefaultPlugin` while it records unresolved initial user intent, and pending work
while it waits for an actor; remove only superseded discovery responsibilities.

Inspection correction: `features/application/fe/pack-frontends.ts` already emits explicit
`PACK_FRONTENDS_SETTLED.failedPacks`, uses cancellation, and preserves incumbents after failed candidate
loads. It does not report failed imports as a successful empty plugin array. Preserve that behavior;
do not reimplement the nonexistent overloaded-result defect. Audit remaining load/retry/unload
coordination for extraction from navigation state, retaining revision, cancellation and readiness
ownership. The shell must not maintain another contribution metadata inventory.

`packages/api/src/transport/packs.ts`, `fe/client.ts` and `packs/layout.ts` currently expose
`packs.loaded` / `LoadedPackEntry` as both an inventory and instructions for loading frontend files.
Expose catalog descriptors separately from activation state. Obtain entry/style references and revision
identity from validated build metadata, eliminating repeated file probing/hashing in list queries.
Preserve revisioned URLs, stylesheet cleanup, `pack://` delivery and the source/HMR loader override.

### Help, commands and editor metadata: retire runtime data stores

`backend-extensions.ts::createHelpStore()` validates, qualifies and sorts static articles on registration.
Move those operations to descriptor validation/catalog projection and remove the runtime help
contribution/undo entries. `features/help/be/system.ts` can remain a delivery adapter; its source becomes
the catalog and its refresh cause becomes catalog change. Help must remain readable after deactivation.

Likewise, move static command metadata and stable ordering out of `createCommandStore()`; keep any
executable command binding separate. `default-setup/src/features/library/be/services/library.ts` combines
`getPackCommands()` with user-content commands: migrate the declared half without treating database
commands as static. Keep updates caused by edited/applied user content. Remove registration-driven
rebroadcasts only where the catalog subscription replaces them. Inspection may list a disabled pack's
commands, but the execution picker must apply eligibility and execution still needs active handlers.
Today's declared slash commands fire `user.command` into flows; discovery must not bypass that path.

`apack-sdk/src/build/generate-entries.ts` builds reference maps/categories/provider arrays by importing
feature modules. `default-setup/src/extensions/tiptap/useReferenceItems.ts` then invokes every provider's
`useItems()` when the picker mounts. Generate data descriptors separately from navigation/provider
bindings; move category/icon readers to the catalog; parse stored targets independently of metadata. Initialize providers only for actual item
queries, with explicit lifetime/disposal, rather than to list categories. Audit `reference-config.ts`,
`ReferenceSuggestionPopup.vue` and `reference-suggestion-plugin.ts` together. Dependency-scoped generated
contracts remain useful; do not replace them with an untyped global provider search.

Step/artifact/block palettes and DSL/editor readers need the same split. Preserve execution-facing
lookup APIs, but add explicit descriptor reads rather than making a method sometimes return metadata
and sometimes an implementation. `fe/pack-store.ts`'s `loadComponents()` runs during registration;
catalog readers must never reach it. Moving component loading to first render is a separate activation
optimization, not necessary to complete this refactor.

### Shared readers and refresh: remove duplication without erasing policy

Use one validated build reader in discovery, activation and offline tooling.
`runtime/lifecycle.ts::activatePack()` reparses `apack.json`; `database/schema.ts` independently reads
installed manifests/snapshots and enablement records. Reuse descriptor/identity/ownership validation
there, while preserving the offline database tool's strict refusal policy and its selected schema.
The schema must match what the app would use; including every disabled declaration is not equivalent.
CLI source inspection and dependency fetching keep their separate build/resolution responsibilities.

Publish a committed catalog revision after install/update/remove/declaration rebuild, independently of
runtime readiness. Migrate static consumers from `PACK_CHANGED` and register/unregister subscriptions
to that revision. Keep `PACK_CHANGED`/`SEND_STATE` where systems need to publish live content or state.
Do not publish intermediate filesystem replacement gaps as removal; retain the prior committed view
until the replacement decision completes, with outcomes handled under the installer contract.

### Runtime machinery to retain

Discovery is not delivery or execution. Keep contribution undo logs/owned binding stores, collision
checks at binding, system teardown/shutdown hooks, module-cache cleanup, runtime facet composition,
and migration/content execution order. Move static ownership checks earlier without trusting that
runtime bindings necessarily match the build.

Keep `packClientReady` and the bus's client readiness handshake until an actual replacement guarantees
that startup messages arrive after actors exist. Knowing a plugin's contract does not make its actor
ready, and does not authorize a connection to claim that plugin. Do not widen event routing from active
bindings to all catalog entries. Catalog initialization itself also needs an explicit ready/error state;
an unread catalog is not an empty inventory.

Give host-owned contributions a data representation too. The host's registration is currently included
in runtime lookups; a catalog containing only installed pack builds would quietly lose host navigation
and settings. Compose trusted host descriptors with installed descriptors through the same ownership
and projection rules, without pretending the host is installed in the packs directory.

### Removal checkpoints

Deliver each consumer migration with deletion of its superseded projection/store/cache and updates to
SDK test doubles, generated contracts and callers. Track remaining runtime reads in the inventory;
avoid compatibility aliases or a permanent parallel catalog/registration API for the same static fact.
For each checkpoint record what was removed, what execution responsibility remains and the regression
test that protects it. Extract the frontend coordinator only when migrating its consumers, so it does
not become a second coordination layer alongside the old shell actions.

## Delivery sequence

1. **Close the inventory on the completed naming baseline.** Map every registration/manifest field and reader to declaration, metadata,
   asset or runtime behavior. Record exact remaining gaps and dependency ownership rules here.
2. **Establish the shared foundation with settings.** Build descriptor validation and the catalog with
   the linked settings plan as the first consumer. Establish checked binding, ownership checks and
   coherent build publication for that projection before switching readers. Complete settings’
   ownership/migration and schema/default/form contract on this foundation, as the roadmap specifies.
   Do not build separate settings and contribution catalogs.
3. **Extend the snapshot descriptor.** Resolve facade terminology and required-facade diagnostics from
   the absorbed [facade goal](../archive/goals/goal-defs-naming.md) in this checkpoint. Add the necessary
   static metadata and asset indexes, deriving them
   from declarations. Start with plugin navigation, reference types and anonymous editor contribution lists.
   Materialize help/step metadata and API/lifecycle contracts until the inventory has no executable reads.
4. **Extend checked binding and freshness before switching readers.** Audit watch/codegen/snapshot
   invalidation with [dev-loop freshness](../goals/goal-dev-loop-freshness.md). For each added kind,
   generate metadata and bindings from the same declaration and build revision; reject added, missing
   or inconsistent bindings. Preserve the last valid catalog on a failed rebuild and report it as stale.
   Do not publish new runtime code against stale metadata. Keep owned binding cleanup and reload checks.
5. **Build catalog readers and move consumers.** Validate installed descriptors; expose data to frontend
   and CLI readers. Move each discovery consumer off runtime registries, preserving deliberate ordering
   and ownership behavior. Follow the audited removal checkpoints above: settings/pack details/help,
   then shell navigation and editor/palette readers. Delete superseded glue in each checkpoint. Report
   incomplete/unavailable packs without trying to activate them.
6. **Prove completeness and update contracts.** Exercise every contribution and consumer, update snapshots,
   schema/API reports, public authoring docs, templates and fixtures, and remove obsolete metadata exports.

Each implementation checkpoint remains usable with migrated callers. Apply the existing snapshot-format
rule for contract changes; do not bump package release versions. This work does not require making pack
execution lazy. Link the resulting catalog boundary into the [deferred lazy activation plan](lazy-activation.md)
without changing migration/content execution order here.

## Handoff to subsequent plans

Entity navigation consumes catalog identities and readiness, then adds its build-checked `opens`
contract. Discovery separates reference metadata from executable navigation bindings; it does not delete
`navigate` callbacks before [entity opening](open-entity.md) migrates their callers. Frontend boundaries
contain runtime component failures; API consumption extends the existing caller-bound facade; replacement
uses committed build/catalog revisions. None introduces a second contribution inventory. Lazy
activation is deferred outside the active roadmap; discovery alone does not change when migrations or systems run.

## Acceptance: no discovery gaps

- A fixture covers every supported contribution kind and its nested metadata. After building, replace
  each executable pack/dependency entry with an import-time throw and update test integrity metadata so
  the test does not merely fail the hash check. Descriptor discovery and each catalog consumer still work.
- Instrument pack module loading and side effects: zero executable pack/dependency loads, actors,
  components, hooks, migrations, appliers and user-data writes during discovery. Test both backend and
  frontend discovery paths; an unused loader mock is not sufficient proof.
- Discovery lists metadata, settings, references, palette entries, editor contributions, help, declared
  content, APIs and lifecycle requirements for enabled and disabled packs. Dynamic results are explicitly
  unavailable until execution, rather than silently absent contributions.
- Missing dependencies, incompatible host/format, malformed descriptors and missing assets yield useful
  status. Shared dependency diamonds preserve true ownership and do not duplicate contributions.
- Activation cannot introduce extra contributions or replace static metadata. A binding mismatch fails
  cleanly without removing another pack's contribution or partially mutating the catalog.
- Update/remove/reinstall refresh catalog entries and preserve user data; failed replacement retains the
  previous valid build/catalog for failures before publication. Activation failures report a separate
  outcome; do not promise rollback of arbitrary migration/content side effects. Verify and document the
  installer’s actual commit boundary before extending replacement.
- Add a contract-coverage check requiring each new registration/extension field to identify its discovery
  representation or executable role. New contribution kinds extend the fixture and relevant consumers.
- Disable/deactivate/reactivate without changing the descriptor: settings defaults and help stay intact,
  pack details remain complete, and navigation identities remain known with their availability status.
- Before frontend imports finish, default and saved/explicit navigation follow the declared selection
  policy. An unknown ref is refused without waiting for unrelated packs; a known ref's queued events reach
  its actor once ready, with correlation preserved. A failed import stays failed, not loaded-empty.
- Exercise reconnect, two windows and update/unload during an in-flight frontend load. Stale results
  cannot restore removed bindings; startup data reaches ready actors; failed replacement retains the
  previous committed inventory without transient removal or reordering.
- Listing reference categories/help/settings/palette entries starts no live providers or components.
  Actual reference queries initialize only their required providers and clean them up on disposal.
- Static catalog refresh does not invoke migrations/content appliers or duplicate live-state broadcasts.
  Edited user-content commands still refresh; offline database schema inspection still honors its
  enablement and strict-error policy. Source/HMR loading and revisioned installed assets still work.

Run focused specs per boundary, external-pack contract/app checks, affected schema/API generation and
`npm run chain`. Add targeted UI checks for navigation/help/settings/palette discovery before activation.
Inspect the built build itself; source-level manifest tests cannot prove installed completeness.

## Research and scope

[VS Code contribution points](https://code.visualstudio.com/api/references/contribution-points) and
[activation events](https://code.visualstudio.com/api/references/activation-events) demonstrate the separation
of declarations and executable implementations. They do not imply all extension behavior is statically
discoverable or require apack to copy their field vocabulary.

Keep process isolation, general lazy activation, executing user migrations during discovery, remote
provider queries and prediction of arbitrary code behavior outside this plan. The completion criterion
is full discovery of the supported contract, enforced at contribution boundaries.

The separate [pack security isolation goal](../goals/goal-pack-security-isolation.md) owns confinement
and resource permission enforcement. Discovery supplies inspectable declarations; it does not grant
access or prove that executable pack code is confined.


## Checkpoint evidence

Build-input investigations, historical foundation surveys and implementation/validation checkpoints
live in [the discovery evidence record](../evidence/discovery-without-activation.md).
This plan retains the supported contract, current checklist and acceptance requirements. The
[execution goal](../goals/goal-settings-and-pack-contracts.md) owns the remaining B1–B6 build work
and checkpoint order. Unresolved requirements in the evidence remain in scope; history is not a
second execution sequence. Record new evidence there and update the current checklist here.
