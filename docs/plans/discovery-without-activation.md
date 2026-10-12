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

Discovery reads validated data artifacts, static assets and host-owned state such as installed versions.
It does not import/require pack or dependency modules, instantiate components or actors, run hooks,
execute migrations/content appliers, query a pack's live provider, or write user data. Build-time compilers
may execute code; their discoverable results must be materialized before installation.

## Existing foundation and gaps

### Implemented artifact reader (2026-10-12)

`parseSnapshot` now validates the current build format's manifest, types, definitions, provenance and
flow helpers as data. Its schema must account for every `PackSnapshot` field; it refuses unknown fields
instead of silently stripping a contribution. Validated records preserve names such as `__proto__` and
`constructor`, which Zod's parsed-object merge would otherwise lose. Build publication, CLI dependency
resolution, the test harness and the runtime loader use this validator before consuming a snapshot.
Entity-name and SDK-ownership checks now run on original manifest records before decoding; a regression
test reproduced the `__proto__` alias bypass and both schema-refusal and original-name guard mutations
are caught. Existing fixture builders now write complete snapshots; their lifecycle assertions remain.

Format selection remains separate from interpretation. Dependency resolution can reject a newer-format
candidate and select another compatible release. A CLI staging for a different installed app checks that
app's format without pretending its own schema describes the other format's grammar. Malformed metadata
in the current format is a refusal, not permission to fetch a replacement or execute runtime code.

This is the reader foundation, not a completed descriptor/catalog: settings data, contribution metadata,
asset/binding identities and coherent catalog refresh are still required. Installed manifest discovery and
the database tool's explicit `--schema-from` reader still need to move onto the common catalog boundary.

Validation: 118 focused snapshot/manifest/format checks and six doc-link checks passed. The final strict
chain passed with `npm run chain -- --strict --cores 1` (152.3s, 23 cached), including external-pack and
packaged-authoring app scenarios; evidence `node_modules/.cache/apack-chain/runs/2026-10-12T12-51-44Z-96251`.
An earlier integration run failed a process-cleanup assertion immediately after parent termination;
its four isolated checks and the final chain passed without changing the assertion.

### Implemented declaration/runtime agreement (2026-10-12)

The snapshot and generated BE/FE registrations now carry `declarationRevision`, a SHA-256 identity of
the manifest's JSON serialization. Publication checks the generated entry literals without importing
pack code, including builds using `--skip-generate`. The loader checks the installed manifest against
the snapshot, then checks runtime ownership and revision before passing the compiled directory or
registering contributions. The frontend checks the backend-retained identity before registration and
stylesheet installation. Retaining it in the active origin avoids reading a newly replaced snapshot as
though an older running backend had already accepted it. `feRevision` remains a separate byte-cache key.

These guards exposed an existing reload defect: require-cache cleanup used the requested directory,
while Node caches the resolved path. Cleanup now covers both paths and a symlink regression verifies
that sibling packs remain cached.

This identity currently covers manifest data only. It is not yet a complete artifact revision: compiled
settings definitions, static contribution metadata, asset hashes, resolved dependency identities and
binding membership still need to join the descriptor contract. Generated-entry inspection checks the
generated modules, not arbitrary custom frontend entry implementations. Runtime checks refuse such
an entry when it exports a different identity; build-time checking of every supported binding remains
part of the descriptor checkpoint. No settings/discovery reader has switched to a catalog yet.

The next descriptor checkpoint must also validate staging/install inputs against the built descriptor.
Keeping the prior `dist` after a failed build does not by itself prevent staging a subsequently edited
source manifest beside those older bytes. Do not treat the runtime refusal as pre-publication rollback.

Validation: 87 focused declaration/codegen/frontend/build checks, 150 runtime lifecycle checks and six
doc-link checks passed. Removing the snapshot identity, binding identity, generated-entry comparison or
resolved-path cache cleanup was caught by its regression tests; each mutation was restored. SDK API
reports were regenerated and reviewed. The stable strict chain passed with
`npm run chain -- --strict --cores 1` (259.9s, nine cached), including real external-pack and packaged
authoring checks; evidence `node_modules/.cache/apack-chain/runs/2026-10-12T13-39-03Z-69678`.
The first broad run correctly refused published-package freshness after a source edit during that run;
the successful rerun held source inputs unchanged.

### Remaining descriptor work

The manifest already names many contributions and implementation references. Codegen produces backend
and frontend registrations, contracts and snapshots; content is compiled; pack staging records integrity.
Reuse this machinery.

Discovery today reads `apack.json` without loading runtime code, but validates only a few identity fields
before casting it to `PackManifest`. Other consumers learn metadata through registered implementations.
`PackRegistration` and `PackFERegistration` are executable binding objects, not complete data descriptors.
The snapshot has a manifest, type declarations and partial contribution provenance, but does not expose
all metadata needed by the shell and tooling.

The completion inventory must cover every field in both registration types and every manifest extension
point. For each field, record identity, ownership, static metadata, data assets, executable binding and
current readers. Nested contribution lists matter as much as top-level keys.

| Surface | Existing declaration | Remaining discovery work |
|---|---|---|
| Pack identity/dependencies | IDs, versions, host range and dependencies | Validate descriptors; retain resolved identities, origin and unavailable reasons |
| Features/plugins | Feature refs, designations, entry paths and default claims | Declare labels, icon references, pinning, pane/route presence, fallback-panel metadata and static shortcut descriptors |
| Settings | Executable feature declarations and a root section thunk | Complete the common data declarations, defaults, schemas and form references in the settings plan |
| Steps/triggers | Type names, facet paths, runtime flags and DSL metadata | Materialize palette labels/categories, initial node values, static connection metadata and facet availability |
| Blocks/artifacts | Type names, facet paths and artifact icon names | Audit remaining labels/metadata; expose descriptors without importing viewers or backend facets |
| References | A feature names an executable reference module | Declare protocols, categories, labels, icons and provider/navigation bindings currently exported from that module |
| Editor contributions | DSL declarations, app-extension slot paths and a Tiptap module path | Individually identify editor extensions; expose static DSL assets and slot metadata without module evaluation |
| Help/content/datasets | Help source path, formats, sources/datasets and writer paths | Publish readable help and compiled-content indexes/assets; separate declared content from rows an applier creates |
| Services/repositories/events | Provided names, contract source paths and generated type declarations | Publish callable API/event contracts and required dependencies as data/type artifacts; no service construction for inspection |
| Hooks/migrations | Hook module and migration targets/lines | Declare hook presence and migration descriptions; implementations stay executable references |

This table is the starting audit, not a second author-maintained manifest. Before implementation, expand
it against the current types and codegen, including frontend-only contributions and the dependency tree.
Every supported field must either have a discovery representation or be explicitly an executable binding.

### Registration coverage audit (2026-10-12, master d7e77829a)

Read the current SDK registration interfaces, manifest schema, codegen and host stores before extending
artifacts. The following is implementation audit evidence, not another author-maintained declaration.
Each grouped row accounts for its named fields; new fields must extend the eventual coverage guard.

| Current fields | Data / executable boundary and ownership |
|---|---|
| `PackRegistration.id`, `name`; FE `id` | Pack identity from the manifest; host origin/update choices are separate |
| BE/FE `features` keys | Pack-local IDs resolved to feature refs; one normalized account for both processes |
| BE/FE feature `designation` | Declared role and owner; cross-pack role conflict checked before binding |
| BE feature `system.machine`, `system.receives` | Machine executable; generated incoming-event names/contracts become descriptor data |
| BE feature `plugin.receives` | Generated outgoing/inbox event contract data, not a component import |
| BE feature `services`; BE `services`, `repositories` | Declared API names/contracts plus checked executable object bindings; service and repository names retain their actual collision rules |
| BE feature `settings`; BE `settingsSections` | Replace executable Zod/thunk declarations with the settings plan's schema/default/form data; remove registration-derived defaults |
| BE `ears.entities`, `ears.relKinds`; manifest `entityShapes` | Declared names/wire values and generated type artifacts; preserve SDK/host reserved names and typed EARS behavior |
| BE `boot.onInit`, `boot.onShutdown` | Hook presence in data; invocation and side effects remain runtime |
| BE `migrations.app`, `migrations.pack` | Version line, target and description data; `up` remains executable; never infer line from shipping provenance |
| BE/FE `steps` | Identity and available facets from keyed declarations; intentional multi-owner facet composition, not last-wins flattening |
| Step `type`, `kind`, `dsl` | Static identity/kind/DSL metadata, already largely declared |
| Step `node.label`, `defaultLabel`, `defaults` | Materialize initial values/static presentation; classify any per-node label function as execution |
| Step `build` | Compile/validate/decompile/branches callbacks execute; relation metadata is discoverable |
| Step `runtime` | Handler executes; async/subflow/waits flags are data |
| Step `fe.nodeConfig`, `colorKey`, `layout`, `handlePrefix` | Materialize static palette/connection metadata; per-node layout calculations remain execution |
| Step `fe.components`, `loadComponents` | Component availability/binding in data; no discovery-time component loader call |
| Step `trigger` | Track field/persistence/query fields and callback presence in data; compile/decompile/register/validation callbacks execute |
| BE/FE `artifacts`; artifact `type`, `fe.icon`, `fe.component` | Manifest icon identifier and viewer presence become data; icon/viewer objects bind on activation |
| BE/FE `blocks`; block `type`, `kind`, `fe.component`, `be.generateAsideText` | Identity/kind/facet availability in data; component and transcript callback execute |
| BE `contentWriters`, `appliers` | Owned entity/content-key identities and hook availability in data; callbacks execute, with existing cleanup |
| BE `commands` | Key/placeholder data; keep user-content commands and their live notifications separate |
| BE `help` | Materialize article identity/title/body/order/feature filters into readable data assets, not just source directory paths |
| FE feature `default` | Static claim; deterministic catalog selection independent of import completion |
| FE plugin `id`, `label`, `isPinned`, `icon`, `hotkeys`, `options.headerClass` | Feature ref, presentation and shortcut descriptors become data; icon objects resolve only when rendering |
| FE plugin `state`, `canvas`, `panel`, `chat`, `settings` | Actor/component/route presence and stable references in data; concrete implementations execute. Form ownership follows the settings plan |
| FE plugin `fallbackPanel.label`, `toggle`, `isShown` | Label/event contract discoverable; state predicate executes and is not a discovery eligibility check |
| FE `appExtensions` | Named slot/component references, retaining actual slot composition/ownership policy |
| FE `tiptapPlugins.extensions`, `popups`, `isSuggestionActive` | Give anonymous contributions stable declared identities; availability in data, extension/component/predicate objects executable |
| FE `dslTypes.prefix`, `schema`, `globals`, `language` | Static editor declarations/assets; read without executing generated frontend imports |
| Feature `references`; reference `protocol`, `category`, `icon`, `svgElements`, `navigate` | Protocol/category/static icon data discoverable; navigation binding remains until entity-opening callers migrate |
| Reference categories `id`, `label`, `primaryIcon`; provider `category`, `useItems` | Category/provider identity and icon data discoverable; live reactive items require that provider's execution and disposal |
| Content sources/datasets/formats and compiled `content.json` | Declared keys, formats, entity targets and compiled indexes/assets; rows written by appliers are not discovery results |
| Manifest `typesEntry`, plugin/system contracts and snapshot `defs`, `types`, `flowHelpers`, `provenance` | Build inputs materialize type/event/facade assets and true dependency ownership; source paths alone are insufficient installed discovery |
| Manifest `build`, `$schema`, `$manifestVersion`, license/description/version/dependencies/host range | Build options are authoring inputs; compatibility/identity metadata is data; descriptive permissions do not establish grants |

Current consumers confirmed: backend registration/defaults stores, frontend registration/default selection,
reference aggregate/provider initialization, CLI validate/build, and installed-layout/offline readers.
At this audit, codegen validation returned no issues when dependency resolution threw. The first
foundation checkpoint fixes this with structured incomplete results and read-only dependency resolution.
`PackSnapshot` still holds manifest/types/facade/provenance but not all hidden metadata above. Extend it;
do not add a second descriptor file authored independently.

The eleven default-setup feature settings modules use Zod objects with explicit defaults, strict objects,
arrays, optional fields, records, enums, nullable values and numeric constraints. The audited modules and
shared hotkey schema contain no refine/transform/preprocess hooks. Prove equivalent validation/defaults
for these concrete shapes before removing the executable declarations; do not generalize that observation
to unrelated Zod APIs or uninspected pack fixtures.

## Architecture

```text
Author declarations + source/content
                 |
               Build
                 |
Complete descriptor + static data/assets + executable artifacts
                 |
       Host contribution catalog
                 |
       Activation binds implementations
```

### One generated descriptor, extending the snapshot

Extend the existing snapshot to carry normalized discovery metadata. Resolve local metadata/data files
at build time, qualify owner identities and embed or index the required static artifacts. Use symbolic
icon names or asset references rather than Vue component objects. Publish generated contracts without
requiring readers to execute their source modules.

The author declares a fact once. Codegen derives the descriptor and runtime binding from that declaration;
do not copy labels/defaults into both a plugin object and a manifest. Where metadata currently comes from
executable exports, move its authoring location to data rather than try to evaluate arbitrary functions
at discovery time. A typed source definition can remain build input only if its descriptor is generated
before installation and there is no independent runtime account of the same metadata.

Read descriptor/data references within the installed artifact and verify them under the existing integrity
contract. Reject unsupported formats, missing required assets and inconsistent identity with actionable
diagnostics. Do not fetch or execute missing dependencies just to list what is installed. Source-checkout
inspection may expose unbuilt/incomplete status, rather than activate the source to fill gaps.

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

`features/packs/be/system.ts::toInstalledPackSummaries()` joins installed manifests with
`registry.getPackExtensions()`. Disabled or failed packs therefore lose contribution details.
`registry.ts::featureSummaries()` and the listing part of `getPackExtensions()` duplicate information that
belongs in the descriptor. Replace these projections and their empty-extension fallback with a catalog
view joined to host-owned installation records, activation outcomes and applied-content offers.

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

`features/application/fe/machine.ts` learns plugins and the default claim in `mergePackPlugins`, after
an import. `fe/pack-store.ts` selects a default from executable plugin objects, and the shell uses
`wantsDefaultPlugin`, `pendingPluginId` and `packFrontendsPending()` to postpone decisions while the
global loader might still reveal a destination. Move plugin identities, navigation order, labels,
visibility defaults and default claims into the catalog. Resolve default selection from a documented,
stable catalog order, preserving explicit navigation and saved-selection precedence. The present
first-registered default behavior is an ordering policy to replace deliberately, not accidentally.

Remove waiting whose only purpose is learning whether a plugin exists. Reject an unknown destination
once the catalog is ready; distinguish a known disabled, loading or failed destination. Retain waiting
needed to deliver events to a real actor, preserving `call`, `answering` and sender correlation. Remove
`wantsDefaultPlugin` only after its selection responsibility has moved; do not delete all pending work
merely because identities are now known.

`features/application/fe/pack-frontends.ts` currently reports failed imports as
`PACK_FRONTEND_LOADED` with `plugins: []`, suppressing further attempts as though the load succeeded.
Replace that overloaded result with explicit activation outcomes. Extract frontend load/retry/unload
coordination from navigation state into one window-owned coordinator, retaining cancellation and stale
result protection during replacement. The shell consumes catalog data plus binding readiness; it must
not maintain another contribution inventory in its context.

`packages/api/src/transport/packs.ts`, `fe/client.ts` and `packs/layout.ts` currently expose
`packs.loaded` / `LoadedPackEntry` as both an inventory and instructions for loading frontend files.
Expose catalog descriptors separately from activation state. Obtain entry/style references and revision
identity from validated artifact metadata, eliminating repeated file probing/hashing in list queries.
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
bindings; move category/protocol/icon readers to the catalog. Initialize providers only for actual item
queries, with explicit lifetime/disposal, rather than to list categories. Audit `reference-config.ts`,
`ReferenceSuggestionPopup.vue` and `reference-suggestion-plugin.ts` together. Dependency-scoped generated
contracts remain useful; do not replace them with an untyped global provider search.

Step/artifact/block palettes and DSL/editor readers need the same split. Preserve execution-facing
lookup APIs, but add explicit descriptor reads rather than making a method sometimes return metadata
and sometimes an implementation. `fe/pack-store.ts`'s `loadComponents()` runs during registration;
catalog readers must never reach it. Moving component loading to first render is a separate activation
optimization, not necessary to complete this refactor.

### Shared readers and refresh: remove duplication without erasing policy

Use one validated artifact reader in discovery, activation and offline tooling.
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
runtime bindings necessarily match the artifact.

Keep `packClientReady` and the bus's client readiness handshake until an actual replacement guarantees
that startup messages arrive after actors exist. Knowing a plugin's contract does not make its actor
ready, and does not authorize a connection to claim that plugin. Do not widen event routing from active
bindings to all catalog entries. Catalog initialization itself also needs an explicit ready/error state;
an unread catalog is not an empty inventory.

Give host-owned contributions a data representation too. The host's registration is currently included
in runtime lookups; a catalog containing only installed pack artifacts would quietly lose host navigation
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
   coherent artifact publication for that projection before switching readers. Complete settings’
   ownership/migration and schema/default/form contract on this foundation, as the roadmap specifies.
   Do not build separate settings and contribution catalogs.
3. **Extend the snapshot descriptor.** Resolve facade terminology and required-facade diagnostics from
   the absorbed [facade goal](../archive/goals/goal-defs-naming.md) in this checkpoint. Add the necessary
   static metadata and asset indexes, deriving them
   from declarations. Start with plugin navigation, reference types and anonymous editor contribution lists.
   Materialize help/step metadata and API/lifecycle contracts until the inventory has no executable reads.
4. **Extend checked binding and freshness before switching readers.** Audit watch/codegen/snapshot
   invalidation with [dev-loop freshness](../goals/goal-dev-loop-freshness.md). For each added kind,
   generate metadata and bindings from the same declaration and artifact revision; reject added, missing
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
execution lazy. Link the resulting catalog boundary into the [deferred lazy activation plan](deferred/lazy-activation.md)
without changing migration/content execution order here.

## Handoff to subsequent plans

Entity navigation consumes catalog identities and readiness, then adds its build-checked `opens`
contract. Discovery separates reference metadata from executable navigation bindings; it does not delete
`navigate` callbacks before [entity opening](open-entity.md) migrates their callers. Frontend boundaries
contain runtime component failures; API consumption extends the existing caller-bound facade; replacement
uses committed artifact/catalog revisions. None introduces a second contribution inventory. Lazy
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
  previous valid artifact/catalog for failures before publication. Activation failures report a separate
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
Inspect the built artifact itself; source-level manifest tests cannot prove installed completeness.

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
