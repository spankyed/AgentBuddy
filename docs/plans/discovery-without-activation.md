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

### Implemented snapshot reader (2026-10-12)

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

`readPackArtifact` now combines installed snapshot/manifest validation with full `integrity.json`
verification. The runtime loader uses it before requiring any pack code; previously it checked only the
layout version and never checked file checksums. The returned SHA-256 artifact revision covers the sorted
file inventory and layout version, so installation paths and checksum-map enumeration order do not change
identity, while different bytes with identical declarations do. Active origins retain the accepted revision.
Captured snapshot/manifest bytes must match the verified inventory, refusing an old declaration read
paired with a replacement artifact's checksums. Manifest identity is checked from the bytes hashed by the
verifier, rather than a later reread. A concurrent-replacement regression proves this agreement guard.
Malformed checksum paths/values, missing/extra files and symbolic links are refused; own `__proto__` file
names are preserved. The installed catalog fixture reads this same boundary with poisoned executable code.
The shared verifier also checks integrity id/version against the manifest before installer teardown or
placement. Shipped-copy comparison verifies the installed receipt and bytes before reporting `current`;
missing, malformed or mismatched integrity and extra links trigger replacement from the shipped artifact.

This verifies the installed tree at the read boundary, not a signature, an immutable filesystem view or
complete source/dependency freshness. Build output now carries a producer-owned file inventory before staging; production catalog publication, binding membership and accepted frontend asset delivery
must use retained identities rather than rehashing whichever bytes are on disk later. Those remain required.

### Implemented producer-owned output receipts

`apack pack build` writes the canonical manifest and the existing layout `integrity.json` into its
staged output after all gates and the snapshot, before publishing `dist`. Its receipt covers every
output file, including source maps and DSL definitions. Reuse verifies the previous output first;
a damaged tree is rebuilt, preventing cached edited files from receiving renewed checksums.

Source staging and shipped comparisons verify that receipt, the snapshot and the source manifest.
The installation variant retains the existing runtime/build/types file scope and omits source maps.
It copies recorded files into a sibling candidate and verifies them against the producer's expected
checksums before replacing the accepted stage. A copy race cannot manufacture fresh checksums for
changed bytes. Foreign snapshot formats remain opaque; layout verification still checks their bytes.

Checks cover missing receipts, changed runtime/snapshot/source maps, copy-time mutation retaining the
old stage and cleaning candidates, and a real build/rebuild whose damaged reusable facade is regenerated.
This does not yet freeze authored inputs or dependency/tool resolution. DSL output staging is implemented below. Installed-copy verification is implemented below; frontend delivery still needs accepted identities.

### Implemented staged DSL generation and frontend resolution

DSL declaration bundling now takes the build output directory and writes directly into its `defs/`.
Reused definitions are copied into the same staged tree. The library frontend bundle redirects the
existing generated `dist/defs/... ?raw` imports to this build's definitions, and its cache key hashes
that exact directory. Standalone frontend bundling and the development server continue to read the
published output. Missing staged files fail rather than falling back to the accepted artifact.

A real cold build, changed-definition build with a later runtime failure, recovery and unchanged
rebuild verify that the accepted artifact/receipt, read record and cache survive failure; recovered
frontend and declarations agree; and both definition and frontend phases reuse unchanged output.
A separate missing-staged-definition check proves the older published copy cannot mask absence.
Frozen authored/dependency/tool inputs, frontend delivery identities, production catalog publication
and contribution binding membership remain required; installed-copy verification follows below.

### Implemented verified installation candidates

Installation copies the complete accepted layout into a private candidate on the destination filesystem.
It verifies candidate bytes and exact receipt equality, including provenance metadata, before checking
the copied descriptor's schema, host compatibility and snapshot. A source changed after the initial
manifest hint cannot silently change pack ownership or evade compatibility checks. Only then does the
teardown hook run, with its own descriptor copy, followed by directory replacement.

Checks cover changed/unsealed bytes, a different valid receipt, changed provenance, source edits during
teardown, raced ownership/compatibility, hook metadata edits and refusal cleanup. Failures in copy or
validation leave the installed artifact and skip teardown. Hook refusals retain files and clean the
candidate; directory replacement's existing rollback remains. None of these guards rolls back arbitrary
hook/activation effects or proves transactional catalog publication.

### Accepted frontend asset delivery checkpoint

The installed loader retains the verified artifact revision and immutable file membership/checksums.
`getLoadedPackEntries` and client-readiness classification project those accepted files without rehashing
current disk bytes. Verified installed catalog entries retain the same receipt and derived revision,
including disabled entries and the previous accepted entry when a replacement is refused.

Installed frontends use `pack://<id>/artifacts/<revision>/<file>`. The identity belongs to the URL base,
so relative chunks, styles and font/image requests retain it. Main reads the receipt, compares its identity
and verifies the exact returned bytes against the listed checksum. Unlisted, missing or changed files,
replacement receipts and symlinks fail. No installed request falls back to shipped output or development.
Stylesheet failures reject before frontend registration/settings binding rather than report success.
Concurrent callers share the actual pending outcome, and unload settles pending loads; finding a link
in the document is not proof that its bytes have loaded.

Source/HMR is an explicit separate route: a development API advertises its live local Vite base URL,
and the renderer loads that graph directly. Monorepo source modules still use the renderer's Vite graph.
A failed source import has no disk fallback. The external fixture uses an async canvas to exercise actual
relative chunk delivery with the same artifact base as its styles.

Keep the asset reader below descriptor/compiler imports. Importing the broad host packs barrel into
Electron main pulled SDK schema code into that bundle, whose external AJV import resolved the root's
different dependency version and prevented startup. `packs/assets` now depends only on Node builtins
and the shared data/path definitions in `layout-paths`; main imports that entry directly. No vendor import
or validation is weakened to accommodate the wrong dependency. The general bundled-dependency owner
resolution issue belongs in the remaining consumed-API/tool provenance audit.

Chromium did not expose these custom-protocol requests through Resource Timing. The app regression
uses an owned CDP network session with caching disabled during its checks and restores that setting
before detaching. It verifies actual chunk/style request bases while the async canvas renders.

This closes installed byte delivery, not the complete discovery contract. Source/dependency catalog
projections currently lack an installed receipt; they must not manufacture one from their current files.
Their complete descriptor/provenance/freshness admission still needs migration. Runtime-loaded entries
remain execution state; static frontend declarations and window activation/retry coordination must still
move to the common descriptor/catalog before the shell becomes a discovery consumer.

This is the reader foundation, not a completed descriptor/catalog: settings data, contribution metadata,
asset/binding identities and coherent catalog refresh are still required. Installed discovery and offline schema admission now share the reader in `e50838e14`, described below.
Source/dependency freshness and the remaining contribution descriptors are still open.

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

Staging now validates current-format snapshot data and its agreement with the source manifest before
touching the destination. Installation performs the same agreement check for pre-staged layouts, even
when the target app's format is unknown; current-format corruption is distinct from a foreign-format
refusal. Failed validation leaves the accepted installation and teardown untouched and removes temporary
staging. Foreign formats stay opaque and retain explicit target-format checks.

This closes the edited-manifest/retained-build gap for readable declarations. Complete source-input
freshness, static assets and binding membership are still required; manifest agreement alone does not
prove those inputs are current. Do not treat activation refusal as pre-publication rollback.

Staging validation: 364 host pack checks, 27 release checks and six doc checks passed; staging,
unknown-format refusal and temporary-cleanup guard mutations were caught. Release stand-ins now rebuild
snapshot identities and ignore generated output as real pack repositories do; release implementation
and metadata are unchanged. The strict chain passed (180.9s, 16 cached); evidence
`node_modules/.cache/apack-chain/runs/2026-10-12T14-28-19Z-88313`.

Declaration identity validation: 87 focused declaration/codegen/frontend/build checks, 150 runtime lifecycle checks and six
doc-link checks passed. Removing the snapshot identity, binding identity, generated-entry comparison or
resolved-path cache cleanup was caught by its regression tests; each mutation was restored. SDK API
reports were regenerated and reviewed. The stable strict chain passed with
`npm run chain -- --strict --cores 1` (259.9s, nine cached), including real external-pack and packaged
authoring checks; evidence `node_modules/.cache/apack-chain/runs/2026-10-12T13-39-03Z-69678`.
The first broad run correctly refused published-package freshness after a source edit during that run;
the successful rerun held source inputs unchanged.

### Implemented authored-file scopes and publication stability

Codegen and reusable bundle phases share `build/pack-inputs.ts`. Module sources are tracked throughout
the pack, rather than only under `src/`; codegen also hashes captured manifest data, declared help and
the SDK source tree. Bundle scopes include generated entries and all asset extensions, including files
outside `src/`. Root build/dependency working trees are excluded; an authored nested `src/dist` is not.
Filename/content boundaries make identities unambiguous and independent of checkout location or mtimes.
Source symlinks are tracked; directory cycles refuse rather than recurse indefinitely.

The build captures authored inputs before reading its manifest and checks them before publication.
A real settings module that adds an authored file during compilation causes refusal, preserving the
previous artifact and removing staging. This is a stability guard, not an immutable source snapshot:
complete external-input/dependency identities and a frozen/coherent build view remain required before
claiming full build-input freshness. The existing diagnostic reads record remains distinct from cache keys.

Validation: 42 focused checks passed, including outside-`src` exports, asset/config/lockfile invalidation,
generated-output exclusions, relocatable identities, symlinks and real-build refusal/rollback. Three
mutations removing module coverage, asset coverage or the publication guard were caught and restored.
The strict chain passed (282.0s, one cached); evidence
`node_modules/.cache/apack-chain/runs/2026-10-12T14-44-50Z-20334`.

### Implemented catalog prototype

`createContributionCatalog` retains validated snapshot data and host-owned enablement independently
of executable registrations. Host app definitions are supplied explicitly and survive an empty pack
list. `packSettings(packId)` projects inline `extensions.settings` declarations directly from each
snapshot, including disabled packs. Duplicate pack IDs refuse the whole candidate and identify both
directories; group IDs are local to their owner. Immutable copies/readonly views protect the accepted
catalog from input and reader mutation. Failed candidates preserve its revision and lookup map.

The installed poison-runtime fixture proves this projection performs data reads without executing pack
code or changing artifacts. Semantic-definition, atomic-publication and owned-copy guard mutations are
caught. This prototype is not wired into production boot or existing discovery/settings readers yet.
Feature schemas, static metadata/assets for the remaining kinds, complete build-input freshness, checked form/runtime
bindings, full artifact revisions and trusted caller binding remain on the completion inventory.

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
| Settings | Inline pack/feature schemas, defaults and form references; host app definition | Catalog-based extraction landed in `f3416ad2f`; retain its policy, restore and window checks while completing the other kinds |
| Steps/triggers | Type names, facet paths, runtime flags and DSL metadata | Materialize palette labels/categories, initial node values, static connection metadata and facet availability |
| Blocks/artifacts | Type names, facet paths and artifact icon names | Audit remaining labels/metadata; expose descriptors without importing viewers or backend facets |
| References | A feature names an executable reference module | Declare type/category identities, labels, icons and provider/navigation bindings currently exported from that module |
| Editor contributions | DSL declarations, app-extension slot paths and a Tiptap module path | Individually identify editor extensions; expose static DSL assets and slot metadata without module evaluation |
| Help/content/datasets | Help source path, formats, sources/datasets and writer paths | Publish readable help and compiled-content indexes/assets; separate declared content from rows an applier creates |
| Services/repositories/events | Provided names, contract source paths and generated type declarations | Publish callable API/event contracts and required dependencies as data/type artifacts; no service construction for inspection |
| Hooks/migrations | Explicit hook exports and keyed migration descriptions/up references | Data and binding checks landed in `3ec4f0a77`; installed details consume them in `6c876c9ba`. Complete native coverage with the remaining kinds |

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
| BE `ears.entities`, `ears.relKinds`; manifest feature/data `entities` | M1 (`2fff8bb76`) derives identity/ownership/shape through `_packEntities`, with flat compiled EARS names and type-only build references. Remaining entity descriptors must reuse this projection; M2 (`3ff590240`) uses `_packRelationTypes` for `data.relations` and derives flat EARS maps. Preserve SDK/host reserved names and typed EARS behavior. |
| BE `lifecycle.onInit`, `lifecycle.onShutdown` | M3 (`e063ec1a5`) records explicit targets in installed/native declarations and checks runtime bindings without invocation. Metadata survives unload; side effects remain runtime. |
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
| Feature `references`; reference `category`, `icon`, `svgElements`, `navigate` | Type/category/static icon data discoverable; navigation binding remains until entity-opening callers migrate |
| Reference categories `id`, `label`, `primaryIcon`; provider `category`, `useItems` | Category/provider identity and icon data discoverable; live reactive items require that provider's execution and disposal |
| Content sources/datasets/formats and compiled `content.json` | Declared keys, formats, entity targets and compiled indexes/assets; rows written by appliers are not discovery results |
| Manifest `features.<id>.types`, plugin/system contracts and snapshot `defs`, `types`, `flowHelpers`, `provenance` | Build inputs materialize type/event/facade assets and true dependency ownership; source paths alone are insufficient installed discovery |
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

### Help publication and browser routing evidence (2026-10-13)

Help articles now materialize in the snapshot, and source declarations explicitly supply parsed data.
Executable registration no longer contains help. Markdown is not an executable-generation input;
the complete build compiles it and checks the authored input identity before publication. The backend
watcher uses that staged build for help edits rather than rebuilding an executable entry containing
articles. Real build coverage verifies changed articles, sealed artifact admission and preservation of
the accepted snapshot after an invalid Markdown edit.

The inactive-pack app check exposed a separate editor defect. ProseMirror's `handleClick` covers single
clicks; its repeated-click classification can bypass that callback. Viewer links now use DOM click
handling, preserving custom in-app article routing on repeated clicks. The Electron OS-opening boundary
also refuses `help.apack.invalid`. The app check captures `shell.openExternal` and proves no external
browser opening while articles remain navigable with the pack disabled.

Focused publication checks pass (8), shell boundary checks pass (16), and the app reproduction passes
both help and backup restoration. The grep-filtered multi-fixture command then exits nonzero because
its second fixture has no matching tests; that is not a complete multi-fixture pass. The complete strict
chain passes sequentially (135.0s, 25 cached), including the whole external app suite and smoke:
`node_modules/.cache/apack-chain/runs/2026-10-13T05-09-32Z-28459`.

Concurrent runs remain a concrete unresolved issue: backup export can fail to deliver its result within
the existing deadline, and Electron worker teardown can stall although smoke assertions pass. Evidence:
`2026-10-13T04-49-16Z-44777`, `2026-10-13T05-00-07Z-49745`, and
`2026-10-13T05-05-08Z-87164` under the same chain runs directory. The first run's retry exposed the
repeated-click failure; subsequent runs with that fix pass help navigation but still exhibit the backup
and teardown stalls. No deadline or assertion was relaxed. Sequential success does not resolve those
failures or complete the full discovery/lifecycle audit.

Native all-kind declarations, other hidden contribution metadata, full source/dependency freshness,
frontend bindings and remaining consumer migration are still required by this plan.

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
binding. A matching declaration stamp alone did not enforce this membership. Installed test artifacts
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


### Native declaration lifetime checkpoint

Remove `refreshNative`: activation must not manufacture declarations or withdraw them on unload.
Host composition admits its data before binding native systems. Bare native registration requires an
already admitted owner; it checks feature identities, dependencies and current settings definitions.
Installed/source admission remains through its existing verified paths. Native declarations are removed
only by an explicit catalog operation, so failed activation and runtime unload preserve discoverable data.

Migrate test stand-ins through a test-only fixture composer that admits the fixture's authored data
before binding and explicitly removes its fixture definition on removal. It must not become a production
registration fallback. Add direct registry checks proving declaration-before-activation, unload/failure
preservation and refusal of missing or mismatched native declarations. Use the existing common catalog.
This lifetime checkpoint retains the current native settings/identity projection; all-kind native metadata,
complete bindings, assets and reader migration remain required before claiming full native discovery.

Native data admission also validates the original candidate shape through the shared settings schemas;
null records, malformed feature definitions and unknown fields cannot become an empty declaration.
The catalog owns immutable copies. Runtime matching defaults only absent fields, never explicit nulls.
Use `nativePackDeclarationFixture` for authored test data and `createNativePackTestRegistry` from the
host's testing entry for fixture admission/binding/removal. Production composition supplies
`nativeDeclarations` explicitly; it never invokes either test composer to discover its own runtime.

The build compiler is another distinct consumer: `PackConfig.loadDefinitions` already merges and checks
the build-only facets. Pass those definitions directly through `compilePack`'s existing contract; do not
register an executable pack in an otherwise unused host registry merely to retrieve them again.

### Review correction: runtime rollback must preserve incumbent resources (2026-10-13)

`reload.ts` currently unregisters the old registration before trying the new one, then re-registers
it on refusal. That is not a resource rollback. `unregisterPack` consumes the incumbent undo log;
`_createPackServices` revokes its captured settings handles and creates a new binding lifetime.
Re-registering the same runtime object cannot revive the handles its module or actor already captured.
A real registry/generated-binding probe confirms this; the old rollback fixture has no settings binding.

The next checkpoint must settle and implement replacement as one admission transaction. Keep the
incumbent's accepted contributions, origin and binding resources until the candidate can commit.
Failed candidate admission releases its own provisional resources and leaves incumbent handles and
actors usable. Successful replacement retires incumbent resources exactly once; ordinary unload still
revokes every captured handle. Do not introduce a disposal exception, a reusable stale handle, or a
retain-binding flag threaded through unrelated teardown callers.

Pure declaration/collision preflight is useful but insufficient: contribution installation or settings
binding can still throw after it. Audit owned stores and global repository registration so releasing an
old resource cannot remove its replacement. Readers must observe accepted state, not an intermediate
unregistered pack. Reuse existing admission/ownership mechanisms and distinguish their resource
transaction from arbitrary pack initialization, migration or applier effects, which cannot be promised
rolled back. Installed artifact/catalog publication and runtime activation remain distinct transitions.

Required regressions use actual generated settings handles: a refused replacement retains the same
incumbent handle and settings subscription; a late binding/contribution failure leaves prior definitions
and origin intact; a successful replacement revokes old handles and exposes new ones; cleanup errors
are reported without skipping owned-resource retirement. Add an actual reload fixture with a bound
handle; registration-map equality alone is not its acceptance criterion.

#### Selected registry transaction

The current backend undo log combines pure indexed contributions with one executable lifetime:
`bindSettings`. Rebuilding the former does not require re-executing the latter. Replace that mixed
mechanism with admitted contribution data and separately owned binding cleanup. Capture contributed
collections once at admission so later mutation of the author's registration cannot change removal.
Build candidate designation/definition/writer/applier/command tables privately, preserving command order.
Existing live readers continue to see accepted tables while candidate binding runs.

Repository entries are an engine-owned lookup mirror, not disposal callbacks. Publish changed entries
through the captured engine only after candidate preparation succeeds; restore its prior entries if
publication fails. No incumbent binding cleanup runs before successful publication. Commit registry
maps/tables once, then retire the incumbent binding exactly once. Cleanup failures after commit are
explicit replacement diagnostics, not a refused candidate or a reason to restore a disposed runtime.
Ordinary unregister still removes accepted data and retires its binding even if cleanup reports failure.

Expose this as one host registry `replacePack` operation and route reload through it. Initial registration
uses the same admission path. Do not expose transaction flags to packs or teach callers to unregister
and repair the registry. Preserve boot-hook/actor restart ordering and keep user-data side effects out
of the registry transaction guarantee.

The implemented host binding gate remains pending during preparation and becomes active only after
publication. The host revokes its port and subscriptions even when a hook captures the port and throws
before returning cleanup, or returns cleanup that omits generated disposal. This is a supported API
lifetime guarantee, not confinement of arbitrary in-process JavaScript. Reconnection/unload does not
revive captured handles. A post-commit cleanup error remains a retirement diagnostic.

### Hook and migration declaration checkpoint design (2026-10-13)

Current code imports a whole `boot.hooks` module without checking its exports and reads migration
object descriptions only after executing the module. Replace both contracts outright. `boot.onInit`
and `boot.onShutdown` each name a checked `path#export` function; presence is known from manifest keys.
Each migration version entry contains inline `description` and an `up` function export target. Version
line/target and description are authored only in data; modules export behavior only. Codegen validates
named callable exports without executing them and emits explicit fields. Runtime admission checks
exact declared hook presence and migration descriptions, not just their types. Migrate scaffolding,
fixtures, public schema/API reports and docs; accept no old key or migration-object fallback. Ordinary
versioned data changes remain supported and separate from obsolete-format conversion.

Hook/migration authoring and checked bindings landed in `3ec4f0a77`. Poisoned-module codegen checks,
real CLI scaffolding/typechecking and runtime mismatch refusals verify the data/execution split. The
final strict chain passed at `2026-10-13T11-47-39Z-39675`. Installed snapshots already carry these facts
through their manifest; static consumer/native completeness still requires migration. This checkpoint
is not a complete discovery implementation or a promise to roll back migration effects.


### Shared installed admission checkpoint (2026-10-13)

`e50838e14` makes installed discovery, catalog refresh, boot, activation/reload and offline database
schemas use one data-only artifact admission path. It validates the snapshot and receipt, checks the
directory's owner and requires a receipt-owned backend entry. Producer/staging readers remain distinct:
a `dist/` build directory is not a managed `packs/<id>/` installation.

Directory presence remains installation evidence when admission fails. Boot now prunes user records
only for removed directories, preserving disabled choices and update provenance through malformed
manifests and later repair. Refused artifacts under valid pack IDs remain removable without trusting their metadata.
Offline enabled schema sources fail explicitly; `--schema-from` validates complete current snapshots
and declaration identities without loading executable modules. The permissive EARS fragment reader
and unused enabled-pack projection are removed. Data fixtures now use complete sealed artifacts.

Focused checks and guard mutations cover record preservation, directory-owner refusal before execution,
invalid offline schemas, incomplete/stale named snapshots and invalid-installation removal. Native
all-kind metadata, static shell/reference/editor discovery, complete source/dependency freshness and
atomic installation/runtime publication remain separate required work.


### Frontend declaration membership checkpoint (2026-10-13)

`c67329374` forwards an owned copy of active backend declarations with installed frontend delivery.
Missing declaration data refuses before import. After import, the declaration stamp is necessary but
not sufficient: feature IDs, designation/default claims, custom forms, step types/kinds/facet presence,
artifact/block types/viewers, app-extension slots and DSL names/prefix/globals must agree before styles,
settings grants or component factories are used. Shared name/key checks serve backend and frontend
admission without importing Node modules into the renderer. Unsupported top-level/feature fields refuse.

Codegen now gives an omitted DSL prefix the empty prefix and quotes prefix/global strings as JSON data;
the frontend check uses the same default. This fixes valid omitted/quoted declarations rather than
accepting the producer's literal "undefined" as metadata.

This does not complete frontend discovery. Plugin presentation/route/shortcut metadata and stable
anonymous editor contribution identities still require declarations; native frontend admission still
needs the complete native model. Icon identity and DSL asset bytes are not established by member-name
checks. The renderer still has to move static readers off runtime registrations.

Frontend replacement still needs an explicit transaction. Correction from the subsequent source audit:
`registerPackFE()` currently refuses duplicate owners; it does not implement replacement. The shell's
`PACK_PLUGINS_UNLOADED` path retires existing frontends before reloading them. Stylesheet ownership is
now staged as described below, but settings/contribution replacement and shell handoff remain open.
Stage resources, publish once, and retire old resources after acceptance; prove failure/cancellation
keeps the incumbent usable. Arbitrary module side effects remain outside rollback.


### Owned stylesheet preparation checkpoint (2026-10-13)

`de0d55480` replaces pack-wide failure cleanup with per-attempt stylesheet leases. Preparation fetches
an inert `media="not all"` link; readiness is awaited, and styles are applied only after frontend
acceptance. Same-href leases share one physical request but own cancellation independently. Disposing
an old owner cannot remove a newer owner using that link. Candidate failure retains accepted CSS;
explicit pack unload disposes accepted and pending leases. Styles-only retries transfer ownership
without duplicating links. An abort during a fresh binding also unregisters that candidate before commit.

The real-app strict gate proves Chromium loads the inert stylesheet and accepted plugin styles apply.
DOM and host seam checks prove failure/cancellation/ownership behavior. This closes stylesheet staging,
not the shell's unload-before-reload behavior or a transactional frontend registry replacement API.
Vite/source-module side effects remain outside installed stylesheet rollback.


### Prepared frontend publication checkpoint (2026-10-13)

`5d1c4653d` replaces the frontend contribution undo log with captured candidate tables and explicit
prepared register, replace and remove operations. A host-owned settings gate keeps candidates pending
and revokes retained ports/subscriptions on refusal or retirement, even when generated cleanup fails.
Collision checks and component loaders run before publication. Accepted membership is captured once;
rebuilding or removal does not rerun authored getters/loaders. Stale or disposed preparations refuse.
Cleanup errors after accepted publication are diagnostics rather than false replacement failures.

The loader joins prepared CSS to the registry commit before observers see new forms. Failed replacements
preserve old lookup data, styles and authority. A replacement with no frontend removes the previous
frontend without a placeholder registration. This is a local registry/loader guarantee: the shell's
reconnect path still unloads first, and frontend actor handoff is not yet implemented.

Evidence: 335 focused host checks pass. Mutations that retire the incumbent early, grant pending writes,
or publish tables before binding each fail the intended regression; sources were restored before
validation. Final strict sequential chain passed in 358.6s (one of 30 gates cached), including actual
external-pack app and packaged authoring. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T14-50-35Z-99576`;
`/private/tmp/apack-fe-transaction-strict-chain-final.log`.

Next audit and implement shell handoff, preserving accepted actors through refused replacements and
removing genuinely absent owners after an authoritative read. Native/all-kind metadata, source/dependency
freshness, navigation, frontend boundaries and all three Phase 6 streams remain required. No plans are
archived; full requirement review and final strict `--all` acceptance remain outstanding.


### Reconnect handoff and generated binding lifecycle (2026-10-13)

`854eea117` separates connection loss from pack removal. The shell cancels an interrupted loader,
retains accepted actors/definitions/resources, and refreshes them after reconnect. Failed list reads
and refused candidates preserve incumbents. A successful authoritative list removes absent owners.
Accepted replacements stop the previous owner's actors, publish new definitions without duplicate IDs,
retain tab order/visibility/selection where possible, and announce readiness afterward. A replacement
that removes its frontend also removes its old actors. This supersedes the earlier unload-first
reconnection behavior and its tests; explicit disable/uninstall still remove their frontends.

Review found a real gap behind the passing shell mocks: the SDK's generated settings binder refused
replacement when an unchanged artifact reused its cached module. The real SDK/registry probe reproduced
`Frontend settings are already bound`. The frontend hook now returns explicit `activate`/`dispose`
operations. Preparation leaves the module's accepted accessor unchanged; host commit activates the
candidate before other host resource publication. Failed publication restores a still-active incumbent.
Retirement cannot revive old handles or clear the new accessor, and it releases the rollback reference.
The generated entry and public API report use this contract outright, without an old-hook alias.

Evidence: 345 focused host checks, 16 SDK settings checks and nine generated-compilation checks pass.
The real shell/loader/registry/generated binder test reuses the same registration and import URL across
reconnect, preserves the actor until acceptance, and proves new authority plus old-handle revocation.
Six mutations covering premature unload, missing-owner reconciliation, actor retirement, early accessor
publication, missing accessor rollback and retired-accessor cleanup fail their intended regressions.
Sources were restored. The first combined strict run found the missed cleanup-function call inside a
generated-code fixture; it was corrected to exercise activation/disposal, without weakening assertions.
Final strict sequential validation passes in 303.7s (15 of 30 cached), including integration, actual
external-pack app, smoke and packaged authoring. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T15-20-17Z-72081`;
`/private/tmp/apack-frontend-handoff-protocol-strict-chain-complete.log`.

This closes reconnect handoff, not the entire replacement workstream. Backend `RELOAD_PACK` currently
restarts systems and publishes `PACK_CHANGED`, but does not request a frontend refresh while the
connection stays live. Normal activation reads still skip accepted IDs. Add accepted-revision-aware
refresh notification together with coherent artifact/runtime publication; do not route replacement
through `PACK_DEACTIVATED`. Installed update/install still have pre-teardown paths. Arbitrary actor/module
side effects and pane failures remain the separate boundary work, not rollback guarantees here.
Native/all-kind declarations, remaining static readers, complete freshness, navigation and all three
Phase 6 streams remain required before final `--all` acceptance and archival.


### Accepted runtime identity and grant freshness (2026-10-13)

`244dd5380` gives captured backend registrations a host-issued runtime revision. `getPackRuntime`
projects that revision with installed provenance; `packs.loaded` carries it with declaration and artifact
identities. It changes on acceptance, including identical-byte reloads, remains unchanged after refused
binding, and disappears on removal. Native registrations without installed provenance return no installed
runtime. No manifest, snapshot, artifact hash or author-supplied revision owns this lifecycle identity.

Settings grant issuance now checks the caller's expected runtime revision as well as declaration/artifact
identity. Resolution checks the current revision, so reusing an origin object cannot preserve an obsolete
grant. Renderer issuance and all owned transport/fixture callers use the required current contract.
This is request freshness over trusted host-issued access; it does not confine arbitrary JavaScript.

Evidence: 103 focused host checks and eight API transport checks pass. Mutations that reuse a revision,
ignore an expected revision, or omit retirement checks each fail its intended regression and were restored.
The real external-pack app proves reactivation of unchanged artifact bytes rejects the old loaded-record
grant request and old credential, while a freshly read runtime succeeds. Final strict chain passes in
182.9s (18 of 30 cached), including integration, real app, smoke and packaged authoring:
`node_modules/.cache/apack-chain/runs/2026-10-13T15-43-13Z-31425`;
`/private/tmp/apack-runtime-revision-strict-chain-complete.log`.

Two preceding validation findings were corrected: the renderer read stale API declarations until an
explicit API rebuild, and the external-pack credential fixture omitted the newly required revision.
The fixture now also proves stale-record refusal after reactivation. The chain's missing API declaration
build prerequisite remains an open freshness defect; fix that dependency rather than relying on manual
prebuilds before final acceptance. Then publish accepted runtime state through the application system's
normal state publication and compare per-owner revisions in the shell's loader. Live frontend refresh,
installed update publication, complete native/static descriptors and every later goal phase remain open.


### Source API contract freshness (2026-10-13)

`6913dbae8` closes the API declaration freshness defect recorded above. Workspace TypeScript resolves
`@app/api` to `src/types.ts` through the existing source condition; other type consumers use the compiled
entry, and runtime resolution keeps the compiled server. The API's imports are now file-relative in source,
tests and scripts, making the contract portable across package compiler contexts. Removed the API alias
resolver, Vite paths plugin, tsconfig alias maps and unused dependency/lock entries. No new build step,
manual prebuild requirement or compatibility alias is introduced.

Evidence: renderer and API typechecks pass; 121 API cases and 67 focused pipeline cases pass. The compiler
resolution regression hides API build output, including its workspace symlink, and still resolves the
source entry. Removing the source condition fails that regression. Actual Node resolution under the source
condition retains `dist/server.js` without importing it. Strict review exposed the API suite's missing root
package metadata cache input; the suite now declares it explicitly. Removing it fails the existing coverage
guard. The source-condition inventory assertion was also updated for the API's type-only contribution.

Final strict sequential validation passes in 228.7s (18 of 30 cached), including integration, real external
pack, smoke and packaged authoring. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T16-12-12Z-81950`;
`/private/tmp/apack-api-source-contract-strict-chain-complete.log`.

Continue accepted-runtime state publication and per-owner live frontend refresh, then coordinated installed
update publication. Native/all-kind metadata, remaining static consumers, complete source/dependency
freshness, navigation, boundaries and all three Phase 6 streams remain required. This checkpoint closes
one demonstrated source-contract defect; full `--all` acceptance and archival remain outstanding.


### Live frontend refresh, readiness and mounted lifetimes (2026-10-13)

`ed8904dd1` publishes accepted runtime revisions through the application system's normal `SEND_STATE`
path, using a private host event and checked host inbox. The shell retains accepted revisions instead of
an ID-only loaded list. Publication is a reconciliation hint: the loader reads authoritative entries,
refreshes changed owners, skips matching lifetimes, and removes absent owners only after a successful
read. Failure preserves the prior accepted revision/resources; later requests retry the changed owner.
Revisions received during preparation queue another read. Unchanged owners retain actors and selection.

Frontend readiness now names the accepted runtime revision. The API refuses stale/unavailable owners,
including identical-origin replacements. The bus records awaiting frontend owners per actor instance:
reload/activation wait, readiness releases them, and removal clears them. Both `CLIENT_CONNECTED` and
`SEND_STATE` requests wait; `PACK_CHANGED` and `DATA_REPLACED` facts still reach their systems. Review
explicitly caught the latter state-publication path after the initial recorder checked only connection.

The real dev-reload check exposed a mounted-lifetime bug: Vue reused a cached canvas whose setup had
captured the stopped actor. `PluginScope` now follows shell actor changes and keys its subtree by actor
session, disposing obsolete content and leaving unchanged scopes mounted. Cached custom forms without
actors had the analogous binding problem. Registry form notifications identify their changed owner;
SettingsEditor remounts that owner's form even for the same component object and preserves unrelated forms.
The SDK's inferred render return report is regenerated; jsdom is an explicit SDK test dependency.

Evidence: 173 focused host/bus cases, 24 API/bus cases, 57 SDK frontend cases and renderer lifetime checks
pass. Eleven mutations cover revision comparison, publication, false failed acceptance, stale readiness,
early startup, missing waiting state/publication filtering, missing actor follow/key, and missing form
key/owner filtering; intended regressions fail and sources are restored. The real cached-module reload
passes, checking changed frontend revision and actor identity before interacting with the new canvas.
The endpoint commits backend work; renderer acceptance follows asynchronously. Earlier typecheck and
host-inbox assertions were corrected, with no validation rule or deadline relaxed.

Final strict sequential validation passes in 385.9s, all 30 gates, including real external-pack app,
smoke and packaged authoring. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T17-20-14Z-50190`;
`/private/tmp/apack-live-refresh-lifetimes-strict-chain.log`.

This closes ordinary live frontend refresh and standard startup requests. It does not provide rollback
of arbitrary module/actor side effects, preserve arbitrary component-local drafts across actor replacement,
or establish per-window epoch filtering for all outgoing messages. Installed install/update pre-teardown
paths still require coordinated publication. Native/all-kind descriptors and static consumers, complete
freshness, navigation, frontend fault boundaries and all three Phase 6 streams remain required. Final
requirement audit, strict `--all` on completed committed source, and archival remain outstanding.


### Plugin declaration audit and implementation design (2026-10-13)

The next slice removes executable plugin assembly as the metadata source. Audit at `7e79cd788`
confirms eleven default-setup plugin modules, three external fixture plugin modules and two native
host views. `PluginSchema` currently declares only entry, contract, default and default visibility;
`generateFrontendEntry` imports the plugin object wholesale. `frontendBindingProblem` verifies a
nonempty label and a machine, but does not compare presentation or pane membership to declarations.
Installed/source snapshots therefore cannot describe the current UI independently of activation.

Every field of `Plugin` is classified below. This is an audit of the supported contract, not another
hand-maintained runtime registry:

| Field | Owner and source after migration |
|---|---|
| id | Generated feature ref; never authored inside a plugin binding |
| label, isPinned, hotkeys, options.headerClass | Inline plugin declaration data; codegen supplies the registered values |
| icon | Named Lucide icon, consistent with artifact declarations, or an explicit custom component target; discovery reads the reference, rendering resolves the binding |
| state | Explicit module/default or named-export target; machine construction and state remain execution |
| canvas | Optional component target or a declared route map; route identities and component references are data |
| panel, chat | Optional component targets; their presence is known before loading the frontend |
| fallbackPanel.label, fallbackPanel.toggle | Inline declaration data; the event retains its supported type contract |
| fallbackPanel.isShown | Named executable predicate target; discovery never evaluates it or treats its result as eligibility |

Concrete cases constrain the shape. Threads has five canvas routes (`list`, `kanban`, `create`, `view`,
`dashboard`) and a chat component. Library imports the named `librarySystem` export. Brain supplies
one state-dependent fallback-panel predicate. Brain and Code each have two lazy view bindings; Flows
and the Memos fixture each have one. Every current icon is a Lucide export, but the SDK also supports
arbitrary icon components; preserve that capability through an explicit component reference rather
than silently restricting the contract to the in-tree icon set. Optional canvas/panel/chat remain
optional; do not invent panes or actors to fill absent declarations.

#### Authored shape

Keep metadata inline and implementation targets explicit. Replace `plugin.entry` with `plugin.state`;
codegen assembles the plugin instead of importing a second handwritten inventory from `fe/plugin.ts`.
Retain existing contract/default/defaultVisible keys and their meanings. A normal plugin is:

```json
"plugin": {
  "label": "Notes",
  "icon": "NotebookText",
  "state": "src/features/notes/fe/state.ts",
  "canvas": "src/features/notes/fe/canvas.vue",
  "panel": "src/features/notes/fe/panel.vue",
  "contract": "src/features/notes/fe/contract.ts#Contract"
}
```

A component target is a source path (default export), or `{ "entry": "path", "load": "lazy" }`
when lazy loading is required. The object form may omit load for an explicit custom icon component.
Support the existing named-export target syntax where a module uses a named component or machine.
A routed canvas uses `{ "routes": { "list": "path", "view": "path" } }`; the routes wrapper avoids
confusing a route named entry/load with a component-target object. Preserve the six existing lazy
bindings; this is component loading, not the deferred general pack-activation workstream.
Custom icon components use the component-target object, leaving string icons unambiguously Lucide
names. Do not execute custom icons to discover them; their rendered output is execution, not metadata.

Fallback-panel declarations retain label/toggle and name the predicate via path#export. Move Brain's
predicate to a small executable module or an appropriate existing module; do not serialize its result.
Delete obsolete plugin assembly files and unused definePlugin authoring exports/callers together.
There are no aliases or dual reads for plugin.entry. Generated registrations still use the bound
Plugin/PluginDefinition types needed by host stores, with metadata supplied from declarations.

#### Native host and common readers

The normalized plugin descriptor must be shared by installed, source-authoring and native declarations;
there is no plugin-only catalog and no fabricated native receipt. Native host metadata is pure data,
separate from the renderer's executable imports and per-window machine factories. The native renderer
uses that metadata when assembling bindings, and admission checks the same label/pinning/shortcuts,
pane/route presence and fallback-panel metadata as external frontends.

Do not assume native implementations physically live in the metadata owner's package: host Settings
and Packs views live in renderer, while their machines/ownership live in host. Resolve native binding
references through trusted composition/build checks, independently of installed artifact paths.
The host/application backend plugin inbox targets the shell actor; it is not a contributed canvas.
Host/help supplies a system, while its articles appear in Settings. Neither needs a fabricated visible
plugin, feature or actor to satisfy a frontend inventory. Classify protocol receivers separately from
contributed views when expanding the remaining native event/system declarations.

The common catalog projects feature refs, declaration identity, enablement and plugin descriptor data
before frontend activation. Source declarations retain source identity; installed entries retain their
real receipts; native entries retain trusted native identity. UI availability/readiness remains a
separate runtime concern. Move installed details and known-plugin discovery to this projection before
changing shell selection. A declared disabled/failed plugin remains describable; it does not become an
eligible destination or trigger component/module execution merely because it is listed.

#### Implementation and verification checkpoints

1. Add shared descriptor/component-target schemas and exhaustive Plugin field classification, then
   change codegen and file/export validation together. Generate metadata and bindings from one accepted
   declaration. Check exact pane/route membership and presentation values before frontend publication.
2. Migrate default-setup, native views, both external fixtures and the authoring template in the same
   usable change. Update doctor, contract-leaf actor-entry checks and source/watch inputs to state and
   component targets. Delete obsolete assembly modules/helper calls. Update the real fork acceptance
   case to edit the manifest label and an actual component, preserving its proof of changed executable
   behavior rather than replacing it with a metadata-only test.
3. Publish the common catalog projection and migrate its first production reader. Cover native views,
   disabled and activation-failed external packs without evaluating entry/component/dependency code.
   Readiness, actor startup and existing transactional frontend resource retirement remain intact.
4. Prove single/routed/lazy panes, named machine exports, custom icons and fallback predicates through
   generated-entry/build checks. Refuse mismatched labels, routes, pane presence, shortcuts and unknown
   plugin fields before committing a replacement; retain the accepted frontend/settings grant on refusal.
   Mutation-check admission guards. Run the actual external app and packaged-authoring checks, regenerate
   public schema/API reports and update authoring docs before committing the implementation checkpoint.

This design audit is not implementation or completion of discovery. References, steps/triggers,
editor contributions, remaining native contracts, complete dependency/build freshness and the other
listed consumer migrations still require their own coherent checkpoints. Keep every goal phase and
all three Phase 6 workstreams active.


### Declarative plugin implementation working checkpoint (2026-10-13)

Plugin declarations now hold presentation, machine/component targets, route identities and fallback
predicate references. The shared framework type and schema agree through a checked schema annotation
and exhaustive field maps. Module/export syntax and reserved route names are validated. Codegen builds
bound PluginDefinition objects from declarations, checks state/predicate/module exports as values,
checks Vue component files and preserves lazy component imports. No plugin module executes during
these checks. JavaScript targets remain supported when the pack's TypeScript configuration permits them.

All eleven default-setup assemblies and three fixture assemblies are removed, along with the authoring
template and definePlugin helper. Library's named machine export, Threads' five routes and all six
lazy bindings are preserved. Brain's predicate is a small executable module; its label/toggle are data.
CLI feature scaffolding writes the declaration directly; doctor shares complete feature-target file
validation. Contract-leaf checks identify the actual state module. The real fork acceptance edits a
manifest label and a Vue component, then verifies the changed component is actually rendered.

Native Packs and Settings presentation now comes from pure host declaration data, with renderer-owned
views and per-window machine composition preserved. Frontend registry preparation accepts explicit
native declarations and applies the shared metadata/pane guard before granting resources. It captures
top-level authored values once, preserving the existing getter-lifetime contract. Native settings groups
are projected into the validator's settings contribution shape; no native artifact receipt is invented.
Full native contribution coverage and source/provenance verification beyond this view slice remain open.

The existing common catalog projects immutable plugins from native, installed and authoring owners.
Installed entries preserve declaration identity and enablement; authoring entries do not invent an
installation enablement decision. App-source advertisements are excluded from selected contributions.
Packs details consumes this projection, showing declared labels even when implementations are inactive.
The redundant hasPlugin summary flag is removed; declaration presence answers that question.
Shell selection/default readiness is not migrated or declared complete by this details-reader change.

Admission compares labels, pinning, shortcuts, header options, pane/route membership and fallback
metadata, rejects unknown plugin fields, and checks executable binding shapes without calling renderers
or predicates. This does not prove arbitrary JavaScript is safe or establish component-source identity
by comparing function objects. Generated imports, checked exports, accepted declaration identity and
existing artifact integrity remain the implementation-binding path.

Focused evidence includes 182 SDK build/codegen checks, 21 initial schema/file checks, 47 reviewed
schema/generator checks, 68 catalog/native/binding checks, 46 retirement/handoff regressions, 77 combined
binding/retirement checks and 25 CLI authoring/dependency/facade integration checks. The actual default
pack builds and renderer typechecking passes. A label-comparison mutation fails the declaration and
native-admission tests; restored source passes all 31 binding checks. Two sandboxed full-host attempts
closed their worker IPC channel; the elevated two-worker run completed, exposing four real fixture/
getter failures among 1,309 cases. Those four were fixed and their owning suites pass. No guard or
assertion was relaxed. Controlled schema/API reports and public authoring docs are updated.

Strict validation remains required before committing this candidate. All other supported contribution
kinds, remaining native inventory, complete freshness, shell/static-reader migration, navigation,
frontend boundaries, API/provenance work and final goal-wide strict --all acceptance remain required.


Validation follow-through: the first strict candidate passed 4,301 of 4,303 host-pool tests and
refused two incomplete fixture paths. The shared SDK fixture now writes its declared state module,
and its completeness assertion enumerates plugin targets rather than reading the retired entry key.
All nine fixture checks and eight build-output-swap checks pass, including the original authored-input
race and artifact rollback assertions. The next strict run passes the full host/pack unit gates and
638 of 639 integration checks; its remaining contract-leaf fixture still imported a filename the
shared manifest no longer designated as the actor module. The fixture now explicitly declares that
unconventional state filename. All 17 targeted leaf-rule cases pass, with their original refusal
assertions retained. Codegen prose now states that plugin modules enter the compiler for value-export
checks while facade event/state types still come from independent contract leaves. Final strict
validation is running; these focused passes are not substitutes for the full app gates or final goal audit.


Final strict validation on the corrected candidate passes all 30 gates in 488.6 seconds (one cached),
including full unit/integration, real external-pack app acceptance in 156.5 seconds, smoke and both
packaged-authoring halves. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-14T00-28-13Z-89285`;
`/private/tmp/apack-declarative-plugins-strict-3.log`.
This completes this plugin declaration/binding/catalog-details checkpoint, not all-kind discovery or
the larger goal. Source/asset provenance checks for the remaining native contributions, other static
consumers, shell readiness/navigation, boundaries, consumed APIs, dependency identity and final strict
--all on finished committed source remain required. No unfinished plans are archived.


### Reference declaration prototype plan (2026-10-13)

Audit after `27803b90f`: six reference types, three categories and three item providers are defined
inside executable feature modules. Codegen spreads their type objects and concatenates categories;
useReferenceItems constructs a last-wins Map by category. Nothing can inspect these names from the
manifest, and duplicate names/protocols can overwrite one another. The generated aggregate is currently
pack-local and is consumed by default-setup's editor; external declarations do not automatically enter
an app-wide reference registry. Do not claim that generating an external aggregate closes that gap.

Replace the string references key with inline maps:

```json
"references": {
  "types": {
    "note": {
      "protocol": "note",
      "category": "notes",
      "icon": "NotebookText",
      "svgElements": [["path", { "d": "M2 6h4" }]],
      "navigate": "src/features/notes/fe/references.ts#openNote"
    }
  },
  "categories": {
    "notes": {
      "label": "Notes",
      "icon": "NotebookText",
      "useItems": "src/features/notes/fe/references.ts#useItems"
    }
  }
}
```

Types, URI protocols and category names retain their current global identity; category providers are
owned by their declared category. Duplicate feature claims within a pack refuse with both feature ids;
dependency diamonds retain actual ownership while distinct owners conflict. Do not silently compose
providers where the existing contract has one provider per category. Type/category icons use the same
Lucide convention as existing artifact declarations; preserve custom component capability through an
explicit component target if the shared declaration needs it. SVG tuples remain data, not executable
factories. Navigation and useItems are checked function exports and are never called for discovery.
Navigation callbacks remain until the entity-opening phases migrate their callers.

The first coherent checkpoint adds shared schema/types, derives codegen from inline declarations,
checks named exports and duplicate claims, migrates the three shipped modules to executable functions
only, and publishes immutable reference/category metadata through the common catalog. A production
pack-details reader must use that data with disabled/failed runtime coverage. This is the foundation,
not completed cross-pack reference discovery or runtime consumption.

The following work has two checkpoints: frontend binding admission, then catalog/editor integration.
Register reference bindings as explicit frontend contributions, validate them against declarations
before publication and preserve accepted bindings on refusal. Then migrate editor/category readers
to the common catalog plus active provider lookup. Cover external
packs, disabled/failed contributions, unrelated owner collisions and dependency diamonds. Dynamic
items still require their provider's execution and scope disposal. Finish native contribution coverage,
entity routing/readiness and stale delivery without keeping the local/runtime discovery aggregate as
a compatibility fallback. Regenerate schemas/API reports and public authoring docs with each usable
checkpoint; final goal-wide acceptance still covers every remaining kind and workstream.

### Declarative reference foundation checkpoint (2026-10-13)

Implemented the first reference checkpoint above. The manifest owns six shipped reference types,
three categories, their icons/SVG geometry and explicit navigation/provider targets. The three source
modules now export executable functions only. Shared authored/native schema checks refuse duplicate
feature claims; generation checks function exports, category availability and dependency ownership,
including shared-ancestor diamonds and unrelated collisions. Custom component icons retain explicit
lazy loading. Source-file diagnostics include reference targets.

The common catalog exposes immutable native, installed and source reference declarations with truthful
origin/revision/enabled information. The production Packs summary and detail view read those declarations;
an isolated real activation failure and a disabled pack both retain their metadata. This is data discovery,
not app-wide executable admission: the editor still consumes its pack-local generated aggregate. Finish
explicit frontend reference bindings, transactional collision/retirement checks and the catalog-driven
editor/provider migration next. Do not retain the aggregate as a fallback after that migration.

Evidence: 16 focused reference checks passed, including native duplicates, no module execution,
custom lazy icons, function refusals, dependency categories and diamonds. Removing the function-kind
guard caused two named refusal assertions to fail; byte restoration returned all 16 to passing. The
strict chain passed all 30 gates in 548.2 seconds with no cached gates: 4,324 host unit tests, 839 pack
unit tests (two existing skips), 639 integration tests, real external/default-fork app acceptance,
smoke and both packaged-authoring halves. Public schema, API reports and authoring docs are updated.
Run evidence: `node_modules/.cache/apack-chain/runs/2026-10-14T01-17-42Z-60078`;
log: `/private/tmp/apack-reference-declarations-strict.log`.

Other contribution kinds, full native/source/dependency freshness, shell eligibility/entity routing,
frontend recovery boundaries, all three Phase 6 workstreams and final committed-source strict --all
acceptance remain required. No incomplete plans are archived.

### Reference frontend admission plan (2026-10-13)

Bindings belong to `PackFEFeature.references`, preserving the manifest's owning feature. The generated
reference module is the single producer of those bindings; the frontend entry registers them. Admission
checks exact type/category membership, protocols, category names, SVG geometry, labels, component
shapes and callable navigation/providers. Do not invoke these contributions to validate them.

Global types, protocols and categories require explicit collision checks: `createOwnedStore` defaults
to last-wins folding and does not enforce exclusivity. Build candidate maps before running candidate
resources; keep the accepted maps/resources unchanged on refusal or abandoned preparation. Replacement
and removal release captured keys. Capture authored reference data before both native and installed
validation; otherwise a getter can pass validation and publish a different protocol. Freeze accepted
metadata while retaining executable component/function identities.

Use one frontend registry `onChanged` subscription for committed contribution changes. The previous
forms-only name concealed that it already fired for all registration changes; migrate forms readers
without keeping an alias. Reference metadata discovery remains the common catalog's responsibility,
independent of this active-binding read view.

This admission checkpoint precedes the catalog/editor migration. The current editor aggregate remains
an ordinary current consumer, with no old declaration format or runtime discovery fallback. Remove it
when readers migrate. Carry common declarations into the window independently of loaded runtimes;
using active bindings alone would lose disabled/failed metadata. Cover protocol/category additions in
an already-open editor and scope/dispose reactive providers on replacement, removal and view teardown.

#### Window declaration transport audit

`packages/api/src/transport/packs.ts` currently exposes only `packs.loaded`, derived from accepted
runtime registrations. `ShellClient.loadedPacks()` and the shell's frontend loader reconcile that
runtime list. Neither is a declaration-discovery transport: disabled and activation-failed packs
are absent. Keep this execution/readiness path distinct from the next window catalog integration.

Expose the existing common catalog's accepted declaration data without loading pack modules. Its
window reader needs current origin/revision/availability, committed updates and reconnect/cancellation
handling; late responses from a superseded backend/window lifetime must not replace current metadata.
The frontend reference maps above supply accepted executable bindings, not the declaration inventory.
Do not implement discovery by inspecting those maps or by creating another authored reference list.

### Reference frontend admission checkpoint (2026-10-13)

Implemented per-feature `ReferenceBindings` in generated frontend registrations, exact binding checks,
global type/protocol/category ownership checks and immutable accepted metadata. Candidate conflicts
refuse before resource hooks and preserve incumbent maps. Prepared abandonment publishes nothing;
replacement/removal release captured keys. Native and installed validation now use captured reference
data, fixing a reproduced getter that previously validated `note` but published `changed`.

The frontend registry's general `onChanged` subscription replaces its misleading forms-only name;
all forms/style/test callers and the testing shell read-port adapter are migrated with no alias.
Discovery still reads the common declaration catalog. The generated pack-local aggregate is derived
from the same per-feature bindings and remains the current editor consumer until the next migration;
this does not deliver app-wide editor discovery or reactive provider lifecycle yet.

Nineteen focused admission tests and the installed getter regression pass. Disabling ownership refusal
failed five targeted assertions; disabling the callable navigation guard failed its targeted assertion.
Both exact source restorations returned all 19 admission cases to passing. The strict chain passed all
30 gates in 520.5 seconds with no cached gates: 4,344 host unit tests, 839 pack tests (two existing skips),
639 integration tests, real external/default-fork Electron acceptance, smoke and both packaged-authoring
halves. Updated SDK reports cover bindings and the shared change-subscription contract.
Evidence: `node_modules/.cache/apack-chain/runs/2026-10-14T01-50-14Z-96639`;
log: `/private/tmp/apack-reference-bindings-strict.log`.

Next implement the window declaration transport and catalog/editor/provider migration described above,
including an actual external reference contributor in a live editor. Complete native locator checks,
other contribution kinds, freshness, entity routing, boundaries, all Phase 6 streams and final committed
--all acceptance. This checkpoint closes admission only; the discovery plan and owning goal stay active.

### Window catalog transport implementation plan (2026-10-13)

Expose the existing common catalog through `packs.catalog`, a subscription that sends the current
snapshot immediately and later committed changes. A publisher-run identity distinguishes backend
restarts from revision changes; stopping the subscription removes its catalog listener. This endpoint
is independent of `packs.loaded` and does not read executable registrations or load modules.

One window-owned reader captures immutable wire snapshots, checks envelope/revision consistency,
ignores older revisions, refuses conflicting data at one revision and isolates connection generations.
The publisher validates declarations before publication; the window validates the ordinary-JSON
frame and snapshot bookkeeping rather than importing Node build tooling to repeat publication checks.
An initial-read timeout exposes a failure, while cancellation closes subscriptions and ignores late
callbacks. Keep the last accepted snapshot on a transport failure with an explicit unavailable status.

The shell client starts/stops this resource with its bus connection without changing activation order
or gating frontend loads on catalog delivery. Guard superseded bus callbacks too: an old subscription
must not reconnect/disconnect resources or announce readiness for a newer window lifetime. Reference
readers, provider scopes and the SDK's declaration read port are the next integration checkpoint;
transport delivery alone does not complete discovery consumers.

### Window catalog transport checkpoint (2026-10-13)

Implemented `packs.catalog` over the existing common catalog, publishing its current snapshot and
committed changes without runtime enumeration or module activation. Native and disabled installed
declarations are covered through the real router. The window reader captures immutable JSON frames,
checks snapshot bookkeeping and revision consistency, distinguishes publisher runs, ignores older
revisions and closes timed-out/failed/disconnected subscriptions. Late callbacks from old generations
cannot overwrite or resurrect the reader; cleanup during synchronous setup is handled too.

The renderer starts/stops this independent resource with its bus lifetime. Superseded bus callbacks
are ignored, including pending status/settings completions. The composed renderer test demonstrates
catalog data becoming ready before settings bootstrap announces connection readiness. This changes
no activation ordering and does not load cold declaration targets.

Twelve reader tests, two router tests and eight renderer-client tests pass. Removing connection-epoch
guards failed three named restart/timeout/disposal assertions; exact restoration returned the reader
suite to passing. Strict validation passed all 30 gates in 371.4 seconds (12 cached), including fresh
Electron/default-fork acceptance, smoke and both packaged-authoring halves. The final composition
assertion and formatting passed a subsequent strict run in 62.1 seconds (21 cached); rebuilt app bytes
were unchanged, so app acceptance was reused. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-14T02-18-57Z-31693` and
`node_modules/.cache/apack-chain/runs/2026-10-14T02-26-46Z-59802`;
logs `/private/tmp/apack-window-catalog-strict.log` and `/private/tmp/apack-window-catalog-strict-final.log`.

Next expose the declaration read port and migrate references/editor/providers to catalog data plus
accepted executable bindings, retaining owner and lifetime identity for eligibility. Test actual
external contributions in an already-open editor, provider disposal and disabled/failed metadata.
Remove the pack-local aggregate when that migration lands. Complete all remaining contribution kinds,
native/freshness checks, entity routing, boundaries, Phase 6 workstreams and final committed --all.
Transport is delivered; discovery consumers and the owning goal remain unfinished.

### Reference binding identity audit and prerequisite (2026-10-13)

Before migrating readers, the active reference maps exposed only configurations. Global names could
not identify the owning feature or distinguish an accepted binding from a declaration at that name.
Extend each read entry with the qualified feature ref, declaration revision and host-supplied runtime/
artifact revisions. Module registration owns its declaration stamp; the host loader supplies executable
identity separately. Capture only those identity fields, so unrelated caller fields cannot overwrite
ownership. Native bindings must not manufacture installed/runtime receipt identities.

Create immutable read entries once during candidate capture, rather than during table rebuilding.
An unrelated pack change must retain entry identity; accepted replacement must change it. This gives
provider scopes a precise replacement signal and prevents unnecessary restarts. Membership/collision
admission and accepted metadata remain unchanged. These maps are executable availability, not the
common declaration catalog; no reader may infer missing declarations from their contents.

The next consumer migration still requires the SDK declaration read port, catalog-driven parsing/
rendering/category discovery, scoped providers and an actual external reference contributor in a live
editor. Eligibility must compare owner and declaration/accepted identity rather than treating a global
name match as sufficient. Entity delivery/readiness still needs its separate planned coordinator.

### Owned reference identity checkpoint (2026-10-13)

Implemented the identity prerequisite above. Reference read entries retain qualified feature ownership,
module declaration stamps and the runtime/artifact identity supplied by the host loader. The host
captures only its identity fields; extra caller fields cannot overwrite ownership or the declaration
stamp. Native entries omit installed/runtime identities rather than inventing receipts. Entries are
immutable and stable across unrelated registry changes, while accepted replacement creates new entries.
All existing readers/tests use the owned entry shape; no old-shape alias or fallback is retained.

Twenty-one admission checks and 31 loader checks passed. Recreating entries while rebuilding tables
failed the stability assertion; exact restoration passed all 21 admission cases. SDK reports agree.
The strict chain passed all 30 gates in 543.3 seconds with no cached gates, including 4,362 host tests,
839 pack tests (two existing skips), 639 integration tests, real external/default-fork Electron acceptance,
smoke and both packaged-authoring halves. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-14T02-40-19Z-74516`;
log `/private/tmp/apack-reference-identity-strict.log`.

Next deliver the declaration read port and catalog/editor/provider migration. The pack-local editor
aggregate still exists as its current consumer and must be removed with that migration. Verify actual
external references in an already-open editor, changed protocols/categories and provider disposal.
This identity checkpoint does not complete discovery, entity readiness or the larger goal; all remaining
kinds/native/freshness, boundaries, Phase 6 streams and final committed --all acceptance remain due.

### Common declaration read-port plan (2026-10-13)

Expose typed projections from the existing common catalog through `FeHostRuntime.catalog`; do not
create another authored inventory or derive declarations from active registrations. References are
its first frontend projection. Share `ReferenceCatalogEntry` across host/window/SDK and one pure
projection function across backend and window snapshots. Carry truthful origin, qualified ownership,
enablement and declaration/artifact identity; native/source entries never manufacture installed receipts.

SDK frontend helpers read declarations and status through that port and subscribe explicitly to
frontend declaration changes. Keep the backend framework's catalog subscription on the backend:
choosing the frontend implicitly when both runtimes are bound would make backend actors observe the
wrong catalog in tests. Tests that reach declarations must provide their catalog explicitly rather
than receiving a fabricated empty inventory.

Cache the window projection by accepted snapshot identity and retain it with unavailable status after
disconnect. Clear it on new connection/disposal. Snapshot observer sets before notifying: subscriptions
created while recreating a view/provider must not be invoked by the current publication. Data reading
must never call providers, navigation or component factories.

After this read-port checkpoint, migrate editor parsing/rendering/category readers and provider scopes,
remove the pack-local aggregate, and prove dynamic external contributions in an already-open editor.
Declaration status and owned executable identities remain separate inputs to eligibility; entity
readiness/delivery follows its dedicated plan. All other discovery kinds and full-goal work remain active.

### Shared declaration read-port checkpoint (2026-10-13)

Implemented `PackCatalogView` on the frontend runtime and the shared SDK reference catalog entry type.
Backend/window readers use one pure projection function over the same common catalog. SDK helpers
read metadata/status and subscribe to frontend declaration changes without consulting active bindings
or invoking contribution code. Backend framework notifications remain backend-scoped. Existing test
bindings provide the new port explicitly; tests needing declarations must supply their catalog.

The window caches reference entries by accepted snapshot identity, retains them with disconnected
status and clears the cache on a new connection/disposal. Notification queues exclude observers added
during the current publication. An observer mutation was caught by the new regression assertion;
exact restoration returned all 14 window reader checks to passing. Thirty focused host checks, 952 SDK
checks and 13 renderer checks pass. Metadata tests cover native, disabled installed and authoring
sources, truthful identity/enablement, immutability, unavailable status and subscription cleanup.

Strict validation passed all 30 gates in 478.8 seconds (11 cached), including 4,366 host tests, 839 pack
tests (two existing skips), 639 integration tests, fresh external/default-fork Electron acceptance,
smoke and both packaged-authoring halves. The initial strict run caught a generic lint rule on an
inline Set copy; an explicit notification queue preserves the required semantics and passes lint.
SDK reports and public docs agree. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-14T03-07-16Z-13212`;
log `/private/tmp/apack-catalog-read-port-strict-final.log`.

The read port is delivered; reference/editor/provider migration is not. Next replace pack-local
aggregate consumers with catalog metadata and owned accepted bindings, prove external contributions
and protocol/category updates in a live editor, and dispose providers across binding/view lifetimes.
Then finish other contribution/native/freshness, entity readiness, boundaries and every Phase 6 stream.
Final committed --all, complete acceptance auditing and archival remain due. The goal stays active.


### Editor/provider consumer audit and migration sequence (2026-10-13)

The read port is ready, but current editor consumers still import the generated pack-local
`REFERENCE_TYPES`, `CATEGORIES`, `ITEMS_PROVIDERS` and `ALL_PROTOCOLS`. The generator derives these
from `FEATURE_REFERENCES`; only the latter is needed for frontend registration. Replace the readers
and remove those aggregates together, including the now-unused `CategoryConfig` and
`CategoryItemsProvider` exports and their reports. Keep the note-type mapping with the notes feature: it
is that feature's entity-to-reference mapping, not an editor inventory.

Concrete audit findings and required fixes:

- `reference-node.ts` builds one parse rule per protocol when Tiptap constructs its schema. Reading a
  current catalog elsewhere cannot update those already-created rules. Use a generic anchor rule whose
  `getAttrs` resolves the current declared protocol at parse time, returning false for unknown protocols,
  empty ids or malformed encoding. Continue encoding canonical entity ids once; labels/codes remain
  presentation. HTML/Markdown serialization reads current declarations, never executable bindings.
- Node views refresh geometry on node changes only. Subscribe to declaration changes for geometry
  updates, unsubscribe in node-view destruction, and resolve eligible navigation at click time. Missing
  bindings leave declared references renderable without activating their owner. Delete the Markdown
  `updateDOM` loop: it visits anchors and does nothing.
- The suggestion plugin filters with the static category list; the popup uses the same static list and
  indexes item icons without an absence check. Read category labels from declarations and render active
  icons only when eligible. A stale or invalid provider item must not cause an undefined-icon crash or
  insert a reference type outside that category's declarations.
- `useReferenceItems.ts` starts every provider during setup and keeps them until the containing component
  dies. Start only the selected eligible category while the suggestion is active. Own a child effect scope,
  stop it before replacement/category change/closure, and dispose all listeners at parent-scope teardown.
  Stable accepted binding identity avoids restarts for unrelated publications. Existing SDK plugin-state
  readers already use `onScopeDispose`, so child effect scopes release their actor/shell subscriptions.

Use one SDK reference reader to join declarations and accepted bindings; editor components must not
repeat ownership/identity comparisons. Metadata reads remain executable-free. Execution requires a
ready catalog, a matching qualified owner, and a current enabled contribution. Installed bindings must
match declaration and accepted artifact identities; absence of an artifact receipt is not permission
to execute an installed entry. Source declarations advertise authoring metadata without installed
eligibility. Native declarations/bindings use their explicit native ownership contract, without
inventing installed stamps. Catalog disconnect stops providers and navigation, while retained metadata
can still describe references. Subscribe to both declaration and accepted-binding changes because their
publications have independent timing. Neither event alone proves an executable binding is eligible.

Implement the shared reader and lifecycle checks first, then migrate all editor consumers and generated
output in one consumer checkpoint. Verification must include actual editor HTML/Markdown parsing after
a protocol is added to an already-created editor, live category/geometry changes, owner/stamp mismatch,
disconnect, disabled/failed contributions, and provider disposal on replacement/removal/closure/teardown.
An unrelated pack update must not restart the selected provider. Exercise an actual external reference
contributor in the app acceptance fixture, not just a mocked default-pack aggregate. Keep Node's typed
array realm intact in editor tests by using the existing explicit JSDOM-global setup.

This sequence changes consumers and subscription ownership, not stored document format. Entity
destination readiness and frontend failure recovery remain requirements of their dedicated plans;
the reference reader must not invent a parallel routing or fault-boundary implementation.


### Reference eligibility reader implementation (2026-10-13)

The SDK now owns the join between common declarations and accepted reference bindings. Metadata
readers never consult executable registrations. Category metadata retains qualified feature ownership
and duplicate names; no map silently overwrites an owner's category. Global-name type/binding readers
refuse ambiguous runtime claims. Authoring source advertisements do not supersede or duplicate an
installed/native runtime claim; source-only entries remain descriptive and cannot execute.

Executable lookup requires ready catalog status, explicit enablement and matching feature ownership.
Installed entries also require a matching nonempty declaration/artifact identity and an accepted runtime
identity. Native bindings have no installed stamps. Readers return the stable accepted object without
calling its provider/navigation/component. Frontend binding notifications are separate from declaration
notifications, so consumers can follow either publication order and dispose both subscriptions.

Focused tests cover both executable groups, status changes, disabled/missing enablement, declaration/
artifact changes or missing receipts, foreign ownership, source metadata, native bindings, ambiguity,
removal/replacement and listener cleanup. Removing owner or artifact matching independently fails the
corresponding named refusal assertion. Editor consumers and provider scopes are still unmigrated;
continue the preceding migration sequence, including actual external contribution acceptance.


### Editor/provider consumer implementation (2026-10-13)

Editor consumers now use the shared declaration and eligibility readers. Protocol resolution belongs
to the SDK and distinguishes authoring advertisements from runtime claims. Generic anchor parsing
looks up current protocols at parse time; rendering/serialization use declaration data, and node views
subscribe to geometry changes with destruction cleanup. Navigation resolves eligible bindings at click
time. The empty Markdown DOM hook and pack-local aggregate exports/types are removed. The notes
entity-to-reference mapping stays with notes rather than recreating a cross-cutting settings/inventory owner.

The picker follows actual editor transaction events, cleans up when its editor changes, and reads
declared category labels. Only its selected eligible category starts a provider. An owned effect scope
ends before replacement/removal, on closing/category change/disconnect and on view teardown; stable
bindings survive unrelated publications. A provider that closes the picker during setup cannot publish
stale items. Unknown/inactive/wrong-category items are excluded before insertion. Popup mounting now
waits for a real editor instance. Actual provider failures still belong to the separate pane-boundary work.

The first frontend build exposed an integration prerequisite missed by the read-port checkpoint:
`@apackdev/sdk/fe/references` was not in the host-shared module map. Its new runtime helpers would have
inlined a second host binding. Add that subpath to the existing shared map; do not add a separate bridge
or inline fallback. Pack tests use the supported frontend test runtime's start/stop lifecycle.

The external fixture declares memo references, exports navigation and a reactive provider, and supplies
a real editor. Its app acceptance check exercises an already-mounted viewer's parsing/navigation and
the editor picker. Focused tests separately cover protocol additions after editor construction, geometry
changes, unavailable navigation, provider scope replacement/closure/disconnect/removal and listener
cleanup. Removing provider disposal fails named lifecycle assertions. Full app acceptance is required
before recording this as a validated checkpoint.

Continue the broader editor contribution/native/freshness audit and verify initial document parsing
when catalog delivery is delayed; generic live parsing alone does not prove initial unknown links are
upgraded when metadata arrives. Every remaining discovery kind, entity readiness, fault boundary and
Phase 6 workstream remains active, alongside final committed-source --all and the full acceptance audit.


### Runtime-check cache correction (2026-10-14)

The final editor cleanup changed the shipped pack's frontend while leaving app workspace bundles
unchanged. Strict app checks incorrectly reported cached because their declared inputs omitted
`PACK_OUTPUTS`: the app loads that pack separately at runtime. Correct external-pack app, smoke, full
E2E and packaged-authoring app inputs to include the separately loaded artifact. A fingerprint regression
changes only shipped frontend bytes and requires each app check's key to change. Runtime build
success or unchanged app bundle bytes alone never proves an unchanged running app. This is part of
required discovery/source-build freshness, not a speculative cache optimization.


Editor/provider validation passed all 30 strict gates after the runtime-check cache correction
(209.3 seconds, 20 cached). External-reference Electron acceptance ran fresh (157 seconds), including
the real fixture's canonical navigation and picker insertion test, alongside smoke and packaged-authoring
app acceptance. Earlier full consumer validation passed in 450.7 seconds; final lifecycle verification
passed 19 focused checks and 850 pack tests. Provider-disposal, retired-node-handler and shipped-pack
cache-input mutations each fail their named regressions, followed by exact source restoration.
Evidence: `node_modules/.cache/apack-chain/runs/2026-10-14T04-06-57Z-42359` and
`/private/tmp/apack-editor-strict-cache-fixed.log`. Initial catalog-delivery behavior and the remaining
contribution/native/freshness work are still due; this is not whole-goal completion.


### Delayed reference metadata: identity contract correction (2026-10-14)

The initial-delivery audit reproduced actual target loss, not merely a missing icon: a cold external
reference is reduced to label text before its declaration arrives. The common UI also still hardcodes
three pack-owned schemes. Waiting for a particular pack or reparsing a whole document would preserve
the wrong dependency and risk edits; discovery metadata must not be required to decode saved identity.

Follow the [reference wire correction](open-entity.md#reference-wire-identity-correction-2026-10-14):
one explicit internal URI containing reference type and canonical entity id, with pure SDK parsing/
formatting independent of declarations. Keep the existing node attributes and use declarations only
for presentation/eligibility. Remove per-type protocol fields/claims/readers and hardcoded UI schemes
outright, migrating all owned contracts and examples without compatibility parsing.

This supersedes the earlier protocol-per-type discovery/consumer design. Type/category ownership and
all other contribution, native/source freshness and entity-readiness requirements stay intact. The
new parser must preserve a target while its pack is absent as well as during first catalog delivery;
publication should refresh presentation without replacing the document or invoking navigation.
The failing reproduction and source audit establish the next implementation; the wire correction
has not been implemented or validated yet.


### Metadata-independent reference identity implementation (2026-10-14)

Follow the implemented [reference identity contract](open-entity.md#reference-identity-implementation-2026-10-14).
The SDK has one pure URI formatter/parser usable by backend and frontend. Existing editor nodes
preserve canonical identity before metadata arrives or after it disappears. Per-type protocols and
their claims are removed rather than becoming aliases; category/type ownership remains unchanged.
Backend note/task backlinks use the same parser. Public schema, reports, manifests, content examples
and actual external reference acceptance migrate to the current URI format.

Continue the intrinsic editor-schema ownership audit: a default-pack-supplied parsing extension is
not proof that a host-only editor preserves references without activating that pack. Resolve this
alongside native editor declarations rather than claim all editor discovery delivered. Entity
routing/readiness, every other contribution/native/freshness kind, failure boundaries and Phase 6
work remain active. Current focused checks do not substitute for final strict/app validation.


The reference identity checkpoint passed all 30 strict gates in 545.8 seconds with no cached gates,
including 4,405 host tests, 855 pack tests (two existing skips), 639 integration tests, fresh real
external-reference/default-fork Electron acceptance, smoke and both packaged-authoring halves.
The external reference/picker case passes with the new URI. Schema and three reviewed SDK API
reports agree; content parity passes all 145 checks after deliberate golden regeneration.
Evidence: `node_modules/.cache/apack-chain/runs/2026-10-14T04-44-15Z-64383`;
`/private/tmp/apack-reference-wire-strict.log`. The intrinsic editor-schema ownership and remaining
whole-goal work above are still required.


### Restored manifest requirements and handoff (2026-10-14)

[Manifest consolidation](manifest-consolidation.md) restores all 17 original redesign decisions,
settles both naming questions and maps every original phase check. Complete its M1–M6 before
extending additional consumers across the split root entity/shape declarations. Existing settings and
reference checkpoints remain valid; they do not complete this restored scope. The roadmap and owning
goal now require these outcomes rather than merely surveys or syntax deferrals.

Discovery additionally owes static flow-to-action relationships and rename-side diagnostics, actual
`apack pack info` contribution identities/availability, consistent authoring/doctor/codegen declarations
and named early validation where possible without execution. Dynamic binding validation remains an
activation boundary; unused utility exports are not undeclared contributions. Preserve source/build
freshness and no unnecessary content reapplication through manifest-only changes.

The facade checkpoint must use `facades`, `PACK_TYPES_FACADE` and cache `facades/`, with named
missing/incapable dependency refusal and unchanged capability-based acceptance. DSL defs remain defs.
The public frontend container becomes `extensions.frontend` as those contributions become declarative;
`hostVersion` remains the single-host compatibility range. All native/source/install readers, fixtures,
templates, schema/reports and public docs migrate together. Intrinsic editor-schema ownership, every
remaining kind, navigation/readiness, boundaries and all Phase 6 streams remain active.


### Dependency facade audit and checkpoints (2026-10-14)

Current inspection contradicts the earlier claim that capability-based dependency admission already
exists. `fetch-deps.ts` calls `_snapshotFormatMismatch` before `parseSnapshot`; installed dependency
tests explicitly refuse absent/different stamps. They prove exact-format refusal, not capability
acceptance. In addition, `generatePackFiles` interpolates a missing facade as `undefined`, so an empty
facade map can reach generated typing without a named dependency error. Correct these defects rather
than treating the historical evidence as proof.

Implement in coherent checkpoints:

1. Use `PackSnapshot.facades`, `PACK_TYPES_FACADE` and cache `facades/`, preserving DSL `defs/monaco`
   and physical `pack-types.d.ts`. Refuse missing/empty required facade data in codegen before output;
   migrate producers, schema, every reader, native/test fixtures, reports and public docs outright.
2. Inspect declared facade type exports against the actual generated consumer's requirements. A
   missing/incapable facade must name dependency, required exports and rebuild remedy. Dependency
   discovery accepts usable current-data capabilities with absent/different artifact stamps as
   diagnostic context; installation/runtime artifact readers retain their explicit exact format policy.
   Use one current-data reader with honest optional stamp types for dependencies, not a dual reader,
   old-format converter, synthesized stamp or fake export. Actual dependent TypeScript/build checks
   must prove acceptance and refusal, including cached and installed candidates.
3. Keep required facade inputs in source/dependency freshness and provenance. A runtime test must
   independently satisfy runtime admission; type capability acceptance does not authorize executing
   an incompatible runtime. Preserve existing DSL assets and controlled EARS types throughout.

This is part of full discovery, before expanding remaining contribution kinds. Native all-kind
declarations, steps/triggers/editor assets, frontend naming, static content edges, CLI inventory and
all later execution phases remain required. No release/version metadata or format constant is changed
by the vocabulary checkpoint.


### Facade vocabulary/data validation outcome (2026-10-14)

Checkpoint 1 above is implemented in `c1d8497b4`: snapshot `facades`, `PACK_TYPES_FACADE`, cache
`facades/`, named missing-content refusal and safe cache names are migrated with all readers/fixtures/
reports/public docs. DSL definitions and physical facade filenames are preserved. Actual dependent
facade typing/completion and flow-helper execution pass; guard mutations fail. Strict passed all
30 steps in 504.7s, recorded in the execution goal.

Checkpoint 2 is still required. Current format-refusal tests remain valid artifact-policy tests; they
do not demonstrate capable type admission. Implement the separate current-data dependency reader,
actual required type-export checking and honest stamp diagnostics, including installed/cache/real
authoring checks. Keep runtime execution admission distinct. Remaining kinds and all later phases
retain their scope.


### Consumed facade export inspection outcome (2026-10-14)

`b1eeebd19` implements actual consumed type-export checks using the shared TypeScript reader and
virtual bundled declarations, with stale-file precedence and no directory writes. Required imports
define requirements; backend-only consumers do not acquire unused plugin-state requirements. Syntax
recovery cannot count as usable capability. Missing/value-only/unresolved/syntax-invalid types fail
by dependency and rebuild remedy. Focused/mutation/real authoring checks and all 30 strict steps passed;
the execution goal records source and exact evidence. EARS/content bytes and API reports are unchanged.

Checkpoint 2 remains open for the separate dependency current-data reader and honest optional stamp
types. Current resolution still rejects absent/different stamps. Audit build/test executable dependency
consumers and preserve exact runtime/install admission before relaxing type-data resolution. Deliberate
skip-generation paths remain in the required dependency/tool freshness audit. No adapter, alias,
synthesized stamp or legacy-key read is authorized. All remaining goal phases retain their scope.


### Dependency current-data inspection outcome (2026-10-14)

`0159acd11` completes checkpoint 2 above: honest optional dependency stamps and shared current-data
validation, actual consumed facade type checks, installed/cache/source resolution and executable-file
withholding on stamp mismatch. Real producer/consumer builds and editor queries accept capable data;
poisoned build/runtime files are never imported by that inspection. Content compilation and harness
execution independently enforce artifact-format eligibility. No aliases, conversions, synthesized
stamps or obsolete-key readers exist. Exact execution validation remains a current artifact contract.
Focused tests, restored guard mutations and strict validation pass; the owning goal records evidence.

Checkpoint 3 remains open. Inspected `build --skip-generate` bypasses generation checks, then only
warns when dependency release versions differ. That cannot prove same-version source/facade/tool
freshness or generated-file integrity. Implement one generation freshness check shared with normal
generation; prove skip paths refuse stale/missing/edited outputs before sealing a build. Keep actual
resolved dependency capabilities and codegen implementation inputs in that identity. Audit normal
source reload and build cache paths too. Preserve explicit runtime admission and defer no later goal
phase: remaining contribution/native discovery, frontend naming, content inventory, navigation,
boundaries and all three Phase 6 streams retain their scope.


### Generation freshness outcome and remaining watcher gap (2026-10-14)

`82d9d7a9c` implements the shared freshness check specified above for normal generation and both build
and facade-report skip paths. Successful generation records exact output hashes. Resolved dependency
snapshots and source/codegen inputs identify the generation; same-version changes do not rely on a
release-version warning. Builds use one dependency resolution for generation and compilation, refuse
stale output before executing content compilers, and recheck before sealing. Actual authoring/build
checks and restored guard mutations pass; the goal records strict evidence and preserved EARS/content.

Checkpoint 3 remains open for watched publication and the remaining dependency/tool/cache audit.
Inspected `build/watch.ts` directly replaces the runtime bundle without refreshing snapshot/facade
metadata or the receipt. A runtime lock prevents writer overlap but cannot make that artifact coherent.
Replace this path with verified publication that preserves matching declarations, checked bindings,
facades and receipt identity. Prove invalid edits retain the accepted artifact, source-contract edits
reach discovery and runtime together, and concurrent watcher requests are not lost. Avoid a second
inventoried discovery projection or unverified reload exception. Assess the cost of the complete build
versus a correctly validated incremental publication before retaining the runtime-only optimization.
Keep all remaining kinds/native discovery and later goal phases required.
