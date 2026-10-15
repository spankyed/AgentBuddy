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

`readPackBuild` now combines installed snapshot/manifest validation with full `integrity.json`
verification. The runtime loader uses it before requiring any pack code; previously it checked only the
layout version and never checked file checksums. The returned SHA-256 build revision covers the sorted
file inventory and layout version, so installation paths and checksum-map enumeration order do not change
identity, while different bytes with identical declarations do. Active origins retain the accepted revision.
Captured snapshot/manifest bytes must match the verified inventory, refusing an old declaration read
paired with a replacement build's checksums. Manifest identity is checked from the bytes hashed by the
verifier, rather than a later reread. A concurrent-replacement regression proves this agreement guard.
Malformed checksum paths/values, missing/extra files and symbolic links are refused; own `__proto__` file
names are preserved. The installed catalog fixture reads this same boundary with poisoned executable code.
The shared verifier also checks integrity id/version against the manifest before installer teardown or
placement. Shipped-copy comparison verifies the installed receipt and bytes before reporting `current`;
missing, malformed or mismatched integrity and extra links trigger replacement from the shipped build.

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
published output. Missing staged files fail rather than falling back to the accepted build.

A real cold build, changed-definition build with a later runtime failure, recovery and unchanged
rebuild verify that the accepted build/receipt, read record and cache survive failure; recovered
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
validation leave the installed build and skip teardown. Hook refusals retain files and clean the
candidate; directory replacement's existing rollback remains. None of these guards rolls back arbitrary
hook/activation effects or proves transactional catalog publication.

### Accepted frontend asset delivery checkpoint

The installed loader retains the verified build revision and immutable file membership/checksums.
`getLoadedPackEntries` and client-readiness classification project those accepted files without rehashing
current disk bytes. Verified installed catalog entries retain the same receipt and derived revision,
including disabled entries and the previous accepted entry when a replacement is refused.

Installed frontends use `pack://<id>/builds/<revision>/<file>`. The identity belongs to the URL base,
so relative chunks, styles and font/image requests retain it. Main reads the receipt, compares its identity
and verifies the exact returned bytes against the listed checksum. Unlisted, missing or changed files,
replacement receipts and symlinks fail. No installed request falls back to shipped output or development.
Stylesheet failures reject before frontend registration/settings binding rather than report success.
Concurrent callers share the actual pending outcome, and unload settles pending loads; finding a link
in the document is not proof that its bytes have loaded.

Source/HMR is an explicit separate route: a development API advertises its live local Vite base URL,
and the renderer loads that graph directly. Monorepo source modules still use the renderer's Vite graph.
A failed source import has no disk fallback. The external fixture uses an async canvas to exercise actual
relative chunk delivery with the same build base as its styles.

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

This identity currently covers manifest data only. It is not yet a complete build revision: compiled
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
previous build and removing staging. This is a stability guard, not an immutable source snapshot:
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
code or changing builds. Semantic-definition, atomic-publication and owned-copy guard mutations are
caught. This prototype is not wired into production boot or existing discovery/settings readers yet.
Feature schemas, static metadata/assets for the remaining kinds, complete build-input freshness, checked form/runtime
bindings, full build revisions and trusted caller binding remain on the completion inventory.

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
| Editor contributions | Keyed Tiptap groups/members and app-extension slots (`e40d157f9`); DSL declarations | Complete intrinsic schema ownership, live editor composition and static DSL asset reads without activation |
| Help/content/datasets | Help source path, formats, sources/datasets and writer paths | Publish readable help and compiled-content indexes/assets; separate declared content from rows an applier creates |
| Services/repositories/events | Provided names, contract source paths and generated type declarations | Publish callable API/event contracts and required dependencies as data/type declarations; no service construction for inspection |
| Hooks/migrations | Explicit hook exports and keyed migration descriptions/up references | Data and binding checks landed in `3ec4f0a77`; installed details consume them in `6c876c9ba`. Complete native coverage with the remaining kinds |

This table is the starting audit, not a second author-maintained manifest. Before implementation, expand
it against the current types and codegen, including frontend-only contributions and the dependency tree.
Every supported field must either have a discovery representation or be explicitly an executable binding.

### Registration coverage audit (2026-10-12, master d7e77829a)

Read the current SDK registration interfaces, manifest schema, codegen and host stores before extending
builds. The following is implementation audit evidence, not another author-maintained declaration.
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

### Help publication and browser routing evidence (2026-10-13)

Help articles now materialize in the snapshot, and source declarations explicitly supply parsed data.
Executable registration no longer contains help. Markdown is not an executable-generation input;
the complete build compiles it and checks the authored input identity before publication. The backend
watcher uses that staged build for help edits rather than rebuilding an executable entry containing
articles. Real build coverage verifies changed articles, sealed build admission and preservation of
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
execution lazy. Link the resulting catalog boundary into the [deferred lazy activation plan](deferred/lazy-activation.md)
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
rolled back. Installed build/catalog publication and runtime activation remain distinct transitions.

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
schemas use one data-only build admission path. It validates the snapshot and receipt, checks the
directory's owner and requires a receipt-owned backend entry. Producer/staging readers remain distinct:
a `dist/` build directory is not a managed `packs/<id>/` installation.

Directory presence remains installation evidence when admission fails. Boot now prunes user records
only for removed directories, preserving disabled choices and update provenance through malformed
manifests and later repair. Refused builds under valid pack IDs remain removable without trusting their metadata.
Offline enabled schema sources fail explicitly; `--schema-from` validates complete current snapshots
and declaration identities without loading executable modules. The permissive EARS fragment reader
and unused enabled-pack projection are removed. Data fixtures now use complete sealed builds.

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
replacement when an unchanged build reused its cached module. The real SDK/registry probe reproduced
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
refresh notification together with coherent build/runtime publication; do not route replacement
through `PACK_DEACTIVATED`. Installed update/install still have pre-teardown paths. Arbitrary actor/module
side effects and pane failures remain the separate boundary work, not rollback guarantees here.
Native/all-kind declarations, remaining static readers, complete freshness, navigation and all three
Phase 6 streams remain required before final `--all` acceptance and archival.


### Accepted runtime identity and grant freshness (2026-10-13)

`244dd5380` gives captured backend registrations a host-issued runtime revision. `getPackRuntime`
projects that revision with installed provenance; `packs.loaded` carries it with declaration and build
identities. It changes on acceptance, including identical-byte reloads, remains unchanged after refused
binding, and disappears on removal. Native registrations without installed provenance return no installed
runtime. No manifest, snapshot, build hash or author-supplied revision owns this lifecycle identity.

Settings grant issuance now checks the caller's expected runtime revision as well as declaration/build
identity. Resolution checks the current revision, so reusing an origin object cannot preserve an obsolete
grant. Renderer issuance and all owned transport/fixture callers use the required current contract.
This is request freshness over trusted host-issued access; it does not confine arbitrary JavaScript.

Evidence: 103 focused host checks and eight API transport checks pass. Mutations that reuse a revision,
ignore an expected revision, or omit retirement checks each fail its intended regression and were restored.
The real external-pack app proves reactivation of unchanged build bytes rejects the old loaded-record
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
references through trusted composition/build checks, independently of installed build paths.
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
are projected into the validator's settings contribution shape; no native build receipt is invented.
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
existing build integrity remain the implementation-binding path.

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
race and build rollback assertions. The next strict run passes the full host/pack unit gates and
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
build revisions. Module registration owns its declaration stamp; the host loader supplies executable
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
module declaration stamps and the runtime/build identity supplied by the host loader. The host
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
enablement and declaration/build identity; native/source entries never manufacture installed receipts.

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
match declaration and accepted build identities; absence of an build receipt is not permission
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
Installed entries also require a matching nonempty declaration/build identity and an accepted runtime
identity. Native bindings have no installed stamps. Readers return the stable accepted object without
calling its provider/navigation/component. Frontend binding notifications are separate from declaration
notifications, so consumers can follow either publication order and dispose both subscriptions.

Focused tests cover both executable groups, status changes, disabled/missing enablement, declaration/
build changes or missing receipts, foreign ownership, source metadata, native bindings, ambiguity,
removal/replacement and listener cleanup. Removing owner or build matching independently fails the
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
E2E and packaged-authoring app inputs to include the separately loaded build. A fingerprint regression
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
Editor and app contributions are declared directly as `extensions.tiptapPlugins` and
`extensions.appExtensions`, alongside other contributions; there is no frontend container;
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
   discovery accepts usable current-data capabilities with absent/different build stamps as
   diagnostic context; installation/runtime build readers retain their explicit exact format policy.
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

Checkpoint 2 is still required. Current format-refusal tests remain valid build-policy tests; they
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
execution independently enforce build-format eligibility. No aliases, conversions, synthesized
stamps or obsolete-key readers exist. Exact execution validation remains a current build contract.
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
metadata or the receipt. A runtime lock prevents writer overlap but cannot make that build coherent.
Replace this path with verified publication that preserves matching declarations, checked bindings,
facades and receipt identity. Prove invalid edits retain the accepted build, source-contract edits
reach discovery and runtime together, and concurrent watcher requests are not lost. Avoid a second
inventoried discovery projection or unverified reload exception. Assess the cost of the complete build
versus a correctly validated incremental publication before retaining the runtime-only optimization.
Keep all remaining kinds/native discovery and later goal phases required.


### Watched publication outcome and external-input audit (2026-10-14)

`1fa16bd7b` closes the inspected runtime-only receipt defect and duplicate watcher/drop-on-busy paths.
Checkout and external-pack development share staged, verified publication before reload. The input
filter is shared with builds, and session teardown waits for in-flight work before profile removal.
Real filesystem, installed receipt, catalog and host-runtime checks pass, as do meaningful restored
mutations and strict validation. The owning goal records evidence and the observed build cost. This
is complete build publication, not a promise of the former runtime-only latency.

Checkpoint 3 remains open for the explicit external-input graph: symlinked authored sources outside
the watched root, dependency snapshots and executable build files, and SDK/tool implementation inputs.
Inspect current readers and caches, retain exact version/origin/content identity and explicit linked
source policy, and prove their changes cannot silently reuse stale declarations or code. Reuse build
input knowledge rather than inventing a separate authored contribution inventory. All remaining
contribution/native discovery, frontend naming, navigation, boundaries and Phase 6 streams remain
required; lazy activation and stronger isolation stay deferred.


### Linked input outcome and dependency/tool evidence (2026-10-14)

`255e80e4d` closes linked authored-data subscription gaps through shared input traversal, parent watches
for atomic replacement and subscription refresh before validation. Executable modules remain physically
inside their pack; no confinement exception is added. Real linked-manifest/host-runtime checks, a restored
subscription mutation and strict validation pass; the execution goal records exact evidence and failures.

Checkpoint 3 remains open for dependency/tool graph identity and provenance. Inspected local dependency
resolution exposes executable files by stamp/existence without verifying receipts, while cache writes
and reads omit resolved source identity. Replace this with coherent verified cache publication and
recorded exact origin/version/content identity, retaining independent type-data inspection. Inspect
source and bundled tool implementation inputs, imported helpers and dependency build code; prove their
changes invalidate stale outputs without relying on release-version changes. Do not preserve the cache
comment that treats provenance as optional. Source and cached/installed build identities must agree.

The editor offline audit is also required: the Monaco loader defaults to jsDelivr, and no renderer
configuration overrides it. The external settings-editor test failed once awaiting the editor and then
passed on retry; network-backed success is not offline acceptance. Ship local editor/worker assets and
exercise real schema completion/diagnostics without external networking. All other goal phases retain
their scope; lazy activation and stronger isolation remain deferred.


### Offline editor outcome and output identity gap (2026-10-14)

`07d544606` closes the inspected CDN editor/worker dependency: renderer-owned Monaco and all supported
language workers are bundled locally. A real renderer reload and JSON assistance/save test runs with
external HTTP blocked, with a rebuilt negative bootstrap mutation proving refusal. Disposal cancellation
uses vendor origin, preserving application errors routed through Monaco. The execution goal records
source, focused checks, restored mutations and strict evidence; the moved staged-DSL integration keeps
all its original assertions.

Source/tool freshness remains open. A negative out-of-band renderer build followed by exact source
restoration left stale built output while the chain reused the previous source-input key. Explicit
rebuild was necessary before the accepted final app checks. Audit output identity as well as input and
implementation/import graphs. Preserve dependency origin/version/content and receipt requirements,
independent type-data inspection, and every remaining discovery/native and later goal phase. The local
editor checkpoint does not complete broader editor contribution declarations or frontend migration.


### Dependency identity checkpoint (2026-10-14)

`439883713` validates requested versus embedded pack IDs across local/file/cache resolution and selected
release versus build/snapshot versions before caching. Focused checks and three caught identity
mutations plus strict validation are recorded in the execution goal. This closes identity substitution
only; cache receipts, coherent publication and persistent provenance/content identity remain required.
Current schema validation rejects invalid declarations normally; no obsolete-key inventory or special
historical-format refusal is introduced. Exact executable build-format checks remain distinct from
capability-based inspection of current type data.


### Verified dependency build cache and terminology outcome (2026-10-14)

`ff4358588` migrates CLI and harness admission to the shared verified-build cache. Exact version,
origin and content identity persist in the resolution record; publication retains old immutable paths
and failed copying/admission leaves the incumbent. Captured snapshot hashes prevent source swaps
from pairing old metadata with new executable identity. Type-only inspection remains independent of
executable admission, with no obsolete-layout reader or conversion.

Pack build APIs, installed inventory, catalog/reference/frontend identity fields and asset URLs now
use build terminology. “Artifact” remains the actual contribution/viewer concept. Current docs,
fixtures and generated API reports agree; the execution goal records source, guard mutations, focused
and complete strict evidence. Historical checkpoint prose retains its historical vocabulary.

Storage/admission is implemented; provenance inspection, dependency/tool graph and out-of-band output
freshness remain required. Neither this cache nor the naming cleanup closes the remaining contribution
inventory, native declarations, frontend boundaries, navigation or Phase 6 workstreams.


### Inspection data outcome (2026-10-14)

`d6fa2c6dc` removes filesystem-count substitutes from pack info. Verified compiled index metadata and
dependency provenance are available without module activation, source files, downloads or cache writes.
The shared index validator also protects existing writer/preview/import/harness paths without changing
provider requirements or serialized output. Info distinguishes data availability from execution and
verified bytes from current authored declarations; doctor uses one dependency frame for checks and
presentation. The execution goal records evidence, including actual producer source removal.

This improves compiled inventory and completes provenance presentation, not discovery for every kind.
Static flow/action dependency edges, native/other contribution kinds, complete tool/dependency/output
freshness, frontend migration and later goal phases remain required.


### Shared output freshness outcome (2026-10-14)

`a667b161a` closes the observed source-restoration output hole: cache reuse checks actual produced
files/bytes, not input identity plus path existence alone. The goal records a real runtime stamp probe,
exact renderer restoration, guard mutation and full/warm strict evidence. This preserves source/
descriptor publication behavior; it does not establish implementation/import-graph coverage, dependent
executable key scope or the drive launcher’s separate freshness nudge. Complete those required checks
and the remaining discovery kinds/later phases before closing this plan.

### Resolved TypeScript input outcome (2026-10-14)

`f8c17e99c` covers fresh resolved TypeScript inputs outside authored/package-declared scopes, including
transitive external declarations, undeclared packages and ambient type roots. Exact source/resolution
metadata bytes enter the common compilation key and publication revalidation. Generated files are
excluded even through imports. Missing targets becoming available change identity; discovery scanning
imports no executable modules. The goal records the pre-fix real-generation failure, passing external
metadata regression, focused checks, byte-omission mutation, costs and full/warm strict evidence.

Do not equate this with full executable closure. Next audit distinct compiler-version/options readers,
Vue/dynamic/runtime inputs, external watch subscriptions and already-loaded compiler identity; the
watcher now uses fresh CLI processes (see the following outcome). Complete coherent frozen execution/publication and scope-cost work,
then manual-build/drive freshness. All remaining contribution/native/static-content discovery and
later goal phases remain required. No plan is closed or archived by this checkpoint.

### Fresh watcher execution outcome (2026-10-14)

`01eec3309` removes executable module-cache reuse between watched builds by spawning the normal
CLI build in a fresh process. The regression distinguishes custom tsImport (already fresh) from
ordinary flow imports (previously stale). Linked packages are checked before child startup; readiness,
staged verified publication, failure retention and reload ordering are preserved. Real source/manifest
replacement, linked data retargeting, invalid edits and host reload checks pass. The goal records
regression/mutation and accepted strict evidence, including the independent reconnect fix
`82bca6529` found in real app settings acceptance.

Worker lifetime does not freeze bytes during compilation. External watch subscriptions, Vue/runtime/
dynamic inputs, exact compiler consumers and coherent frozen reads/publication remain required,
with measured costs. Then complete manual-build/drive freshness and every unfinished contribution/
native/static-content and downstream phase requirement.

### External TypeScript watch outcome (2026-10-14)

`b956785fe` subscribes to fresh inherited configuration and TypeScript resolution probes, including
missing paths and physical aliases. Existing subscriptions survive failed builds; creating only the
missing external target can recover publication. Authored root watches are shared, duplicate byte/
topology frames are skipped, and package-root compression bounds native recursive subscriptions
without recursively watching filesystem ancestors. Linux retains selected leaf watches.

`ba3d8df85` aligns declaration bundling with inherited aliases and baseUrl resolution while preserving
genuine package/Node imports, fixing the full-build refusal the watcher fixture exposed. The goal
records actual facade/event updates, refusal retention, mutation checks, platform topology, measured
subscription cost and full/committed-source strict evidence.

Resolved type/configuration subscriptions are implemented. Runtime/Vue/dynamic and dependency input
closure, exact compiler consumers and coherent frozen execution remain required before freshness
certification. Then finish manual-build/drive behavior and all remaining contribution/native/static
content and downstream goal phases.

### Compiler-discovered runtime package outcome (2026-10-14)

`61d882b7d` closes a concrete cached-frontend gap: unchanged npm declarations previously hid changes
to an undeclared imported package's JavaScript. The common compiler projection now exposes package
owners; the existing byte/dependency graph includes those owners and their transitive dependencies.
Watch signatures and subscriptions use the same graph, including runtime files, directory membership
and absent dependency candidates. Package entries are never executed for discovery. Consumer roots
remain excluded from library byte scopes, including when nested beneath a discovered owner.

Actual build and watcher regressions prove a JavaScript-helper-only edit updates the frontend.
The goal records the failing baseline, scoped-link/ownership checks, async refusal and repair coverage,
strict timeout diagnosis, subscription optimization, measured scope/cost, and passing strict checks on
committed source. No input coverage or test budgets were dropped to obtain that result.

Vue/script/style/asset and dynamic inputs, exact compiler consumers and coherent frozen execution
remain required. Pre/post byte verification does not freeze compiler reads. Continue manual-build/
drive freshness and every remaining supported contribution, native/static-content and downstream
phase after those source-build requirements; this checkpoint does not complete discovery.

### Vue script import outcome (2026-10-15)

`94ab5f834` extends the common compiler input projection to Vue scripts using the existing SFC parser.
Inline blocks, script setup and external script sources resolve through in-memory script roots without
execution or filesystem output. Physical component context handles linked imports; both authored-root
spellings exclude generated output, and canonical paths keep input identity independent of checkout
location. Pack-local manifest entry validation is preserved.

Actual cached frontend builds update after only inline/external script dependencies or a linked nested
component's outside helper change. Automatic watching covers a Vue-only undeclared npm import.
The owning goal records failing baselines, focused checks, compiler-suite placement corrections,
strict failures, measured cost and accepted strict validation on committed source. EARS/content are
unchanged; test assertions and timeout values are preserved.

Styles, template assets and other runtime/dynamic inputs still need their own consumer audit. This
script projection is neither a Vue component typechecker nor an immutable execution environment.
Retain exact compiler-consumer alignment, frozen execution/publication, scope cost, manual-build/drive
freshness and every remaining contribution/native/static-content and downstream goal requirement.

### Frontend compiler authority checkpoint (2026-10-15)

Source `7c97e8553` removes frontend output reuse: an actual two-build regression retained stale CSS
when only an external Vue stylesheet changed. Vite runs once per build; facade and DSL reuse remain.
The current compiler reports watch files and PostCSS directory dependencies over private worker IPC,
independently of optional diagnostic records. Ready subscriptions retain incumbent/partial scopes
through refusal and replace them after success. Logical and physical directory identities preserve
link-retargeting detection. Authored outputs and unrelated profile activity are excluded.

Rename events use a subscription-scoped ancestor index, and package traversal uses directory-entry
file types rather than repeating metadata reads. Package fingerprints remain byte-identical; no input
scope is narrowed or cached across builds. Vue input cases now prove compiler-frame invalidation as
well as real Vite output; disabling script discovery fails all three invalidation assertions. Full CLI
watch/publication, atomic replacement, refusal retention and external-file recovery coverage remain.

The owning goal records focused, mutation, type and real CLI evidence. The source checkpoint is
reviewable, but bulk strict validation is unresolved: the last completed run exceeded the aggregate
integration deadline without a logged assertion failure. It is not a full acceptance pass. The user
requested a 60s feedback cap shared by the chain and direct integration runner; do not repeat long
whole-suite retries to diagnose a local failure or silently treat the cap as an assertion failure.
Resolve the bulk gate before final committed-source strict --all and completion.

The following checkpoints cover static empty-glob forms and worker compiler inputs. Continue dynamic
graphs, exact compiler-consumer alignment and coherent frozen execution/publication. Retain manual-build/drive freshness and every remaining
contribution/native/static-content, navigation, frontend boundary and Phase 6 requirement. Nothing
is archived or excluded by this checkpoint.

### Nested content-directory links (2026-10-15)

`7ad1f0396` and `01aaa18ab` observe physical targets beneath reported content directories, including initially empty
and dangling nested links. The same traversal signs directory membership and collects subscriptions;
canonical ownership excludes authored outputs and visited physical roots bound cycles. Unchanged
tracked-link metadata does not invalidate the namespace; creating an unreported stylesheet symlink
still triggers missing-target repair. Watching remains independent of diagnostic read records.

A failing baseline, 105 passing focused cases, CLI typechecking and an actual Tailwind CLI
rebuild prove this slice; target additions and retargeting into authored templates both publish the
expected CSS in 20.7s under the 60s bound. Link identity remains signed when target contents belong
to the authored tree, so output exclusion does not hide topology changes. The goal owns the evidence.
This completes reported-directory link coverage, not arbitrary glob/worker/dynamic input closure,
frozen execution or the outstanding bulk strict gate. All other goal scope remains required.

### Frontend globs and worker compiler inputs (2026-10-15)

`49f2647f3` adds membership subscriptions for static external `import.meta.glob` declarations,
including arrays, exclusions, literal `base` and root-entry subpath imports. `53550379d` installs
input-reporting plugins in Vite's separate worker builds, including nested workers. Each report
accumulates the compilation's files, so the main bundle's final report cannot discard worker inputs;
diagnostic records and live subscriptions share that set. Worker globs use the same directory observer.
Actual Vite tests cover dependency-only changes, nested worker glob additions and changed output.
A real CLI test retains the accepted revision after worker compilation fails and publishes its repair.
The goal records baseline failures and focused validation. Arbitrarily computed glob options,
remaining dynamic graphs, exact compiler identity, coherent frozen execution/publication,
manual-build/drive freshness and the aggregate strict gate remain required. No broader phase is closed.

`a6be184da` additionally observes the fixed relative directory prefix of variable import templates,
which Vite expands after user plugins. A previously empty import graph now observes matching-file
additions/removals, including filename prefixes; explicit `@vite-ignore` imports remain runtime-owned.
This is conservative subscription coverage, not a replacement for Vite's expansion or proof of frozen
reads. The goal records the failing baseline, seven passing compiler cases, nested-worker regression,
105 focused checks and type/lint evidence. Computed glob options, exact compiler identity, coherent
execution/publication, manual-build/drive freshness and the full strict gate remain open.

`f74617e5f` also routes the initial `pack dev` build through a fresh CLI process after refreshing linked
packages, removing its in-process compiler-cache boundary. Supervisor teardown aborts the initial
child; private input reporting is enabled only for observed builds. Actual startup, cancellation and
watcher refusal/repair checks pass, and a mutation back to in-process compilation fails the regression.
This does not prove direct-command bootstrap identity, long-lived frontend compiler identity or frozen
reads/publication. Those remain part of the full compiler-consumer and freshness acceptance gate.

### Direct build bootstrap correction

The audit found `buildCommand` imported compiler modules before refreshing linked packages. Move actual command
compilation to a private worker entry selected by the existing native bootstrap over an owned IPC
channel. The public command validates flags and delegates; `runPackBuild` refreshes before spawning.
Initial development and watched builds use that same entry directly, avoiding recursive public-command
dispatch and the duplicate child-side refresh. Preserve public build flags, generation/refusal and
atomic publication behavior; leave release orchestration unchanged. The worker terminates on lost
parent IPC and disconnects after completion. Ship the private entry in the bundled CLI; source mode
uses the existing source bootstrap. No public worker command, compatibility route or new manifest key.

Acceptance: real direct/source and copied-package builds honor flags; changed same-version compiler
chunks invalidate skipped generation; watched builds retain compiler reports and refusal recovery;
startup/cancellation checks remain valid. Verify worker packaging and parent-channel lifetime, and
typecheck/lint changed code. This establishes the command's fresh-process boundary, not immutable
filesystem inputs or long-lived frontend compiler identity. Keep those and the final strict gate open.

Implemented in `1a1895529`. Four source/copied-package and worker-lifetime cases pass in 14.68s;
78 focused checks and both CLI/tooling typechecks pass. Startup/cancellation and real watched worker
error/repair pass in 24.19s. A mutation back to in-process public compilation fails the regression.
The goal owns the logs. The lifetime test observes process exit plus ended output streams: an isolated
Node reproduction showed parent-initiated IPC disconnect can omit `close` even when both streams
end. No process-group machinery is needed. Frozen reads, long-lived frontend compiler identity,
remaining input closure, manual-build/drive freshness and the aggregate strict gate remain open.

### Frontend editor declaration checkpoint

Replace the opaque frontend registration-module target with explicit plugin groups:

```json
{
  "extensions": {
    "tiptapPlugins": {
      "suggestions": {
        "extensions": {
          "reference": "src/editor/reference.ts#ReferenceNode"
        },
        "popups": {
          "references": "src/editor/ReferencePopup.vue"
        },
        "isSuggestionActive": "src/editor/suggestions.ts#isSuggestionActive"
      }
    },
    "appExtensions": {
      "toolbar": "src/Toolbar.vue"
    }
  }
}
```

Plugin and popup keys are local to their pack/group; extension keys preserve actual Tiptap names.
Keep meaningful plugin grouping. Registration carries matching keyed bindings; generated imports name
each declared export. Validate missing/extra groups and members, extension-name mismatch and predicate/
component shapes without executing them. Reject extension-name collisions transactionally, naming
both pack/group owners. No conventional aggregate export or anonymous arrays remain.

Use the same frontend data contract for native declarations, installed snapshots and authoring data.
Project it through the common catalog/window view and CLI inspection without importing executable
modules; retain origin, enablement and accepted identities. Migrate schema/module-target validation,
codegen, every reader, native/test fixtures, default-setup, public docs and API/schema reports together.
Prove poisoned/unavailable executable modules do not affect discovery, binding refusals preserve the
incumbent, and real external-pack/default-pack compilation agrees with declared members.

This checkpoint does not complete editor ownership: host-owned intrinsic document parsing, native
editor composition and live editor/palette migration remain required. Preserve the reference wire
identity and behavior; do not invent features or treat mutable runtime results as static inventory.
All other discovery/source-freshness, navigation, boundaries and Phase 6 work stays in the goal.


### Explicit editor contribution checkpoint (2026-10-15)

Source `e40d157f9` declares editor groups and app slots directly under `extensions.tiptapPlugins`
and `extensions.appExtensions`. This replaces the earlier proposed frontend wrapper at the user's
request: a contribution kind's placement does not claim exclusive ownership of frontend behavior.
Native declarations carry the same fields directly. Each editor group names extension objects,
popup components and its optional suggestion predicate; generated bindings import checked exports.
Schema checks refuse duplicate extension claims within a pack, and active binding admission refuses
cross-pack collisions transactionally. Captured membership cannot be changed through caller-owned
maps. Catalog/window projections and CLI inspection expose native/source/installed identities without
executing modules or requiring authored source files; disabled declarations remain visible.

Validation: 251 focused declaration/codegen/catalog/renderer tests pass in 6.22s
(`/private/tmp/apack-editor-final-unit.log`); 22 default-pack reference editor tests pass in 3.00s
(`/private/tmp/apack-editor-default-tests.log`). A real external-pack build with Tiptap objects,
Vue popups/app extensions and a typed predicate passes, then its copied output is inspected after
removing authored source (`/private/tmp/apack-editor-external-final.log`, 9.36s). Default-setup builds;
all seven baseline generated EARS/content files remain byte-identical. Public API/schema reports
were regenerated and reviewed; strict validation passes API/schema/export checks, all typechecks,
lint/specifier/tier checks, runtime build, smoke, external-pack contract and packaged authoring.

The strict checkpoint is **not fully green**: the aggregate integration pool was killed at its
existing 60s deadline, with no assertion failure in its captured output. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-15T09-09-11Z-19925`,
`/private/tmp/apack-editor-strict-retry.log`. The earlier strict attempt found two missing catalog
methods in default-pack test mocks; those fixtures are fixed and the pack typecheck now passes.
The aggregate gate and final committed-source strict `--all` remain required. This checkpoint does
not complete intrinsic editor-schema ownership, native editor composition, live editor/palette
migration, remaining contribution discovery/source freshness, navigation, boundaries or Phase 6.
No scope is excluded or archived.

### Intrinsic reference schema ownership checkpoint

Current code still declares the `reference` Tiptap node in default-setup's suggestions group. That
module owns persistence parsing/serialization, node presentation and a pack-specific suggestion
plugin. Consequently a renderer without default-setup's frontend lacks the stored-document schema,
even though reference declarations themselves are available without activation.

Split those responsibilities at the existing composition boundary:

- Move `ReferenceNode` into `@apackdev/ui` with the other document primitives. Preserve its wire node
  name, attributes, URI parser, HTML/Markdown behavior, node-view refresh/disposal and eligible click
  behavior. Navigation callbacks remain until the entity-navigation phase migrates them.
- The host's native declaration claims `tiptapPlugins.references.extensions.reference`, with its
  module/export reference. The renderer supplies that UI object in its existing `host` registration.
  Native declarations remain data-only; host/backend code does not import UI or the Tiptap node.
  Existing checked binding and cross-pack ownership rules cover the intrinsic name too.
- Default-setup declares a separate `referenceSuggestion` extension that installs its existing
  ProseMirror suggestion plugin. It no longer owns the reference node. No alias, fallback node,
  invented feature, second registry or duplicated document-schema inventory.
- Move the node behavior tests with its owner; prove cold HTML/Markdown and stored JSON preserve
  targets with no external packs registered. Exercise actual renderer host registration and collision
  refusal, and prove the pack's suggestion extension still installs its plugin alongside the native
  node. Update public exports/reports and manifest documentation with the move.

This checkpoint does not complete live editor recomposition: editors already open while a contributed
extension group changes still need an explicit state-preserving strategy. Resolve that next, including
pending edits, selection/history, removed nodes and popup/provider disposal; do not pretend a fresh
editor instance or static metadata alone proves that behavior. Other discovery/freshness, navigation,
boundaries, dependency/API/replacement work and the aggregate strict gate remain required.


### Native reference schema ownership checkpoint (2026-10-15)

Source `f8c6b2262` moves `ReferenceNode` and its behavior tests into `@apackdev/ui`. The native host
catalog declares `tiptapPlugins.references.extensions.reference`; the renderer supplies its binding
before loading external frontends. Backend discovery imports no UI implementation. Default-setup
now contributes `referenceSuggestion`, which installs its existing suggestion plugin alongside the
host-owned node. The URI/node/attribute identities, Markdown/HTML behavior, metadata-driven icon
refresh and eligible navigation are preserved; navigation callbacks still belong to Phase 4's migration.
No alias, fallback schema, new feature or duplicate registry was introduced.

Seventy-five focused catalog/binding/UI/native renderer checks pass in 6.82s
(`/private/tmp/apack-native-reference-regressions.log`). Nine default-pack suggestion/provider tests
pass in 2.75s (`/private/tmp/apack-native-reference-suggestion.log`), including suggestion activation
and dismissal. Removing both native declaration and binding makes the actual renderer test fail on
its missing reference pill; exact source is restored and passes
(`/private/tmp/apack-native-reference-{mutant,restored}.log`). The built Electron app passes with
default-setup disabled: it renders a saved reference and preserves JSON/HTML/Markdown targets, using
the app's actual shared UI module and native registration
(`/private/tmp/apack-native-reference-electron-final.log`, 3.9s). The first browser assertion ran before
Tiptap's deferred view attachment; the test now waits for its DOM through Playwright. E2E typechecking
and final whole-repo lint pass. The UI export map/report are regenerated and reviewed; all seven
baseline generated EARS/content files remain byte-identical.

Strict checkpoint evidence: `node_modules/.cache/apack-chain/runs/2026-10-15T09-20-06Z-30733`,
`/private/tmp/apack-native-reference-strict-final.log`. Type/API/schema/export/facade/specifier/tier
checks, default-pack/runtime builds, external-pack contract and packaged-authoring checks pass or
retain valid cached results. The aggregate integration pool again exceeds its 60s deadline; it has
no completed assertion failure in captured output, and remaining scheduled app checks are not proved
by that interrupted gate. This is not a green full chain or phase completion. The aggregate gate,
final committed-source strict `--all`, live editor recomposition, remaining discovery/source freshness,
entity navigation, frontend boundaries and all Phase 6 workstreams remain required. Nothing is
excluded or archived.

### Accepted editor binding identity and lifetime

The current editor takes `tiptapPluginRegistry.getAll()` once during setup. Popup membership and
Escape predicates therefore retain an unloaded pack, and an editor created before a pack arrives
never adopts it. The registry also discards pack/group identity when projecting its accepted bindings.
The catalog supplies declared membership, but cannot stand in for accepted executable bindings.

Installed Tiptap source confirms `Editor.setOptions()` only updates options/view props and state;
it does not rebuild the extension manager or schema. `registerPlugin()` reconfigures ProseMirror
plugins, not node/mark definitions. Do not use either API as an alleged general schema replacement.

Implement in coherent checkpoints:

1. Preserve `packId`, `groupId` and the captured `binding` in the registry's accepted editor projection.
   Return immutable rows and a detached list, preserving pack/group order and incumbent binding object
   identity across unrelated commits. Expose committed-change subscription through the existing SDK
   registry. Refused/disposed candidates publish nothing; disposal unsubscribes. Native bindings use
   this same contract. This is runtime availability, distinct from the declaration catalog.
2. Recompose the actual editor only when its accepted extension membership/objects change; metadata
   changes alone must not reset it. Key popup lifetimes by qualified contribution identity and editor
   generation, and read predicates from the current accepted generation. Dispose old popup/provider
   and editor resources before exposing replacements.
3. Preserve pending document content and selection/focus when the replacement schema can represent
   them. Verify schema round-trips rather than silently dropping unknown nodes/attributes/marks.
   If required content has no usable provider, retain the original document and present an unavailable
   editor until it can be represented safely. Do not keep unloaded executable callbacks alive or emit
   normalized/damaged content as a save. Cover parent content/entity changes while unavailable.
4. Treat undo/plugin state explicitly: arbitrary opaque plugin state is not transferable across schema
   replacement. Preserve history for updates that do not replace the editor; reset it on actual schema/
   extension replacement and document that boundary. Do not access private Tiptap managers or mutate
   ProseMirror history internals to suggest stronger preservation than the libraries support.

Prove install/replace/remove/re-enable against an already-created editor, stable unrelated updates,
pending edits, selection, provider/pop-up disposal, unavailable content and unchanged native reference
parsing. Include a real external contribution path. This work remains part of Phase 3, together with
all other discovery/freshness and downstream goal requirements; it is not an exclusion or completion.


### Accepted editor binding identity checkpoint (2026-10-15)

Source `45e8465ad` preserves `{ packId, groupId, binding }` in the accepted editor registry, including
native groups, and exposes committed-change subscription through `tiptapPluginRegistry.onChanged`.
Rows are immutable, returned lists are detached, and unrelated registrations retain incumbent
binding objects. Consumers use `.binding`; declarations/unavailable groups remain in the catalog.
No alias or second registry. This implements step 1 of the editor lifetime design above; the editor
still takes its initial snapshot, so live recomposition and retirement are **not** complete.

Fifty-five focused ownership/transaction/native renderer tests pass in 1.93s
(`/private/tmp/apack-editor-binding-tests.log`). A lost-notification mutation fails the subscription
regression; exact source is restored and all ten lookup tests pass
(`/private/tmp/apack-editor-binding-{mutant,restored}.log`). The rebuilt Electron host-only editor
preserves saved references through the new binding projection
(`/private/tmp/apack-editor-binding-electron.log`, 10.5s). Affected direct typechecks pass, public
frontend/runtime API reports are regenerated and reviewed, and all seven baseline generated EARS/
compiled-content files remain byte-identical.

Strict checkpoint: `node_modules/.cache/apack-chain/runs/2026-10-15T09-29-51Z-38416`,
`/private/tmp/apack-editor-binding-strict.log`. All type/API/schema/export/facade/lint/specifier/tier
checks and pack/runtime builds pass; smoke, external-pack contract and packaged-authoring checks
pass. The aggregate integration pool is killed at its existing 60s limit, with no completed assertion
failure in its captured output. This remains a failed full checkpoint gate; it is not waived or a
phase-completion claim. Final committed-source strict `--all`, editor recomposition/unavailable
content handling, every remaining discovery/freshness kind and all downstream phases stay required.


### Live editor composition checkpoint (2026-10-15)

Source `8863043a6` replaces the editor's one-time binding snapshot with scoped accepted-change
subscription and generation-checked composition. Qualified extension identity determines replacement;
unrelated commits and popup/predicate-only changes preserve the editor/history. Popup lifetimes have
qualified keys. Replacement retires old views/providers first, then restores pending JSON, selection,
stored marks and focus. Exact document/mark round-trips refuse silent attribute/node loss. An
unavailable schema retains pending data without emitting a save; compatible re-enablement restores
it, and explicit document/entity changes replace suspended state. Actual extension replacement resets
opaque undo/plugin state, as selected above. Failed cleanup is logged and view/listener cleanup is
attempted without preventing a usable replacement. No private Tiptap managers or history internals.

Twenty-seven focused UI/reference/lifetime checks pass in 3.69s
(`/private/tmp/apack-live-editor-verified-unit.log`), covering rapid generations, unmount/subscription
retirement, popup/predicate replacement, focus/selection/pending formatting, history boundaries,
sub-document notifications, unavailable nodes, schema attribute loss and throwing cleanup. Removing
the document integrity guards makes the data-loss regression fail; exact source is restored and all
nine lifetime cases pass (`/private/tmp/apack-live-editor-{mutant,restored}.log`). Two built Electron
checks pass in 6.6s (`/private/tmp/apack-live-editor-electron-provider.log`): native-only references and
an already-open unsaved slash-command/reference draft while the installed default pack is enabled
and disabled through the real loader. Document, selection and save count remain unchanged.

Strict evidence: `node_modules/.cache/apack-chain/runs/2026-10-15T09-47-54Z-48208`,
`/private/tmp/apack-live-editor-strict.log`. Type/API/schema/export/facade/lint/specifier/tier checks,
pack/runtime builds, smoke, external-pack contract and packaged authoring pass. Public report
regeneration produces no contract change; all seven baseline EARS/content files stay byte-identical.
Final renderer/E2E typechecks and whole-repo lint also pass after the added focused tests. The aggregate
integration pool still hits its 60s override; the full gate remains failed, not waived. Final strict
`--all` on committed source is still required.

This closes the selected open-editor update checkpoint, not the whole editor/discovery phase. These
checks do not prove arbitrary cold custom-node documents without their implementations; retain that
provider/readiness audit with remaining static DSL/Monaco/palette discovery and consumer migration.
Every remaining source freshness, navigation, frontend boundary and Phase 6 requirement stays active.

### Integration deadline scope correction

The temporary 60s feedback cap is applied to the entire integration pool in both the chain and direct
runner. Individual integration tests and hooks already have independent 60s bounds. Recent strict
runs show multiple healthy build/watch cases completing before the aggregate is killed at 62s, with
no assertion failure; the aggregate cap therefore prevents the required gate from completing rather
than detecting the earlier worker-close bug (which is fixed and regression-tested).

Remove the named-step override and its helper/message/test scaffolding. Both aggregate callers use
the existing `suite` ceiling (300s), while test/hook bounds remain 60s and focused `quick` checks
remain 60s. This is a correction to which operation the limit governs, not a new timeout class or
measured-cost multiplier. Run existing timeout/graph checks, then the real strict chain; investigate
any actual assertion failure or stall instead of increasing limits again. This supersedes the earlier
pool-wide cap instruction after the observed interference; no required validation is waived.

### Validation work placement corrections

Deadline source `b910bc66e` removes the aggregate-only override; all 89 graph/timeout checks pass.
The strict run (`2026-10-15T10-02-14Z-56915`) and an isolated integration run now expose actual work
placement defects instead of the 60s aggregate cutoff. The isolated run passes 54/55 files before its
300s ceiling: `frontend-resources.integration.spec.ts` combines 19 serial glob, worker and asset
scenarios in one worker. Split it by those existing concerns, sharing fixture cleanup/output readers
and preserving every test body, assertion, input variant and per-test bound. Do not increase deadlines.

The app gate also exposes `default-pack-fork.spec.ts` building all of default-setup in `beforeAll`.
Its 60s hook expires under load and `afterAll` deletes the still-compiling source directory. Move the
fork's source mutation, real external build and archive production into the existing contract-preparation
stage. Declare its source inputs and generated output handoff in the chain. The app test reads that
prepared archive and keeps the 60s hook/test policy; normal boot/reload/replacement acceptance remains.
No fake archive, bypassed compile, new success stamp or package-manager cache protocol. Retain bounded
producer cleanup, and leave release/version metadata and unrelated work untouched. Prove the full
integration and external app paths after these structural fixes, then resume required discovery work.


### Validation placement outcome (2026-10-15)

`21110749b` implements the fixture/watcher separation above. All 19 watcher cases and 58 assertions are
preserved; contract preparation builds the real fork archive, and app runners check its shipped-build
provenance. Replacement, reload and normal fork/removal/restoration boot checks pass. The isolated pool
then completed all 57 files / 739 tests but exposed a task-update RPC timeout: the two long synchronous
scaffold suites needed the existing between-case event-loop yield policy. Adding those hooks clears it.
The final strict checkpoint passes, and strict validation on committed source passes with unchanged
successful checks cached. The owning goal records exact runs and counts. This is not final `--all` or
completion of discovery; all outstanding consumer, source-freshness and later-phase requirements remain.


### Step discovery: declaration and reader sequence (2026-10-15)

Current code keeps `StepEntry.node` as an exported `StepNodeFacet` target. Codegen imports it into both
registrations; backend binding checks only its presence/object shape. Palette labels/defaults therefore
require executable module imports despite being data. `StepFEFacet` also hides category, icon target,
connection rules, colors and layout flags beside executable components/layout callbacks. UI
`node-styles.ts` caches active-registry projections indefinitely. Native declarations do not yet cover
steps. This is required work, not a reason to treat the existing module paths as complete discovery.

Implement these dependent checkpoints:

1. Inline `extensions.steps.<type>.node` as `{ label, defaultLabel?, defaults? }`. Generate the same
   data into both bindings and compare it exactly before admission. Migrate every authored pack,
   scaffold/template, source reader, fixture and public/schema/API contract; remove the redundant node
   exports outright. The StepDefinition runtime node data contract remains. Inspect useful node data
   without authored modules or activation. A metadata-only step has no executable directory; do not
   invent a module path to find types/helpers. Checkpoint 2 replaces the remaining executable-directory
   inference with explicit `types` and `dsl.helpers` module declarations. No aliases or conversion.
2. Declare the frontend's static step metadata and component/layout bindings, sharing checked schemas
   with native declarations. Keep calculated layout callbacks executable and expose their availability,
   not predicted results. Preserve component loading metadata and module-reference semantics. Complete
   common catalog/window projections and native/installed binding membership before switching readers.
3. Replace palette/style/default and static layout discovery reads with committed catalog data;
   executable node/form/layout evaluation still requires accepted bindings/readiness. Remove active-
   registry discovery unions and permanent derived caches. Prove disabled/unavailable declarations,
   replacement/unload/re-enable, ownership conflicts, native parity and real external authoring.

For checkpoint 1, preserve every default exactly as JSON data: the current LLM model string is a pack
node default; omit the switch default's `predicate: undefined` because the durable JSON contract means
absence. Verify the resulting creation behavior. Do not change generated EARS types or compiled content
identities. Keep the model runtime fallback separately where execution uses it. Required checks include
schema/codegen/static-target coverage, backend/frontend mismatch refusal retaining incumbent bindings,
CLI inspection with poisoned modules, real scaffold/external/default builds and app node defaults.
Regenerate reviewed schema/API reports, run focused and strict checkpoint checks, commit and record
source evidence before continuing. This sequence leaves the full goal and native/static assets,
source execution/freshness, navigation, boundaries and all Phase 6 requirements intact.


### Inline step node data outcome (2026-10-15)

`324816421` completes step checkpoint 1 above: node labels/defaults are inline manifest data, both generated
bindings carry it and reject differing data, authored node exports are removed, and scaffolds, module
readers, CLI inspection, schema/API reports and public docs agree. Metadata-only nodes do not trigger a
pack-root types/helpers search. Nested defaults are copied on creation; actual repository/trigger/model
checks pass, with all seven baseline EARS/content files unchanged. Guard mutations fail and exact source
is restored. Strict serial-step validation and committed-source default strict validation pass; the owning
goal records commands, runs and counts, including the earlier invalid-fixture failures and their fixes.

Continue with the planned native/installed frontend step declaration and checked-binding checkpoint,
then migrate palette/style/default/layout discovery readers and remove permanent active-only caches.
Calculated layout and actual compiler/runtime/provider calls stay executable. This does not close step
or full discovery, source execution/freshness, native lifecycle, editor readiness, navigation, boundaries
or any Phase 6 workstream. Nothing is archived or excluded.


### Frontend step declaration design (2026-10-15)

The current 15 authored frontend step modules contain data, Vue/icon imports, lazy component factories,
and two calculated layouts. Replace their opaque `fe: "path#export"` target with a data object:

```json
{
  "node": { "label": "Example" },
  "types": "src/extensions/steps/example/types.ts",
  "fe": {
    "nodeConfig": {
      "icon": "Box",
      "category": "logic",
      "connectionRules": { "inputs": 1, "outputs": 1 }
    },
    "colorKey": "indigo",
    "components": { "form": { "entry": "src/extensions/steps/example/form.vue", "load": "lazy" } },
    "layout": { "hasInput": true, "getHeight": "src/extensions/steps/example/layout.ts#getHeight" }
  }
}
```

Keep the meaningful `nodeConfig`, component-slot and layout groups. Icons/component loading use the
existing component-target grammar; component and function targets stay pack-root-relative. Layout
callbacks remain code and get checked named exports, not computed JSON results. Preserve all existing
flags, connection counts (including -1 for unlimited), colors, prefixes and loading modes.

Deleting the frontend modules removes the last useful directory anchor for frontend-only steps. State
step type modules explicitly in `types`, and custom flow-helper modules in `dsl.helpers` (a whole-module
export-star contribution). Remove `dsl.custom`, executable-directory inference and all three conventional
file probes. No dummy executable facet to locate types, no extra type aliases/shapes, no dual reads.
Migrate every pack, fixture, scaffold, source/module/freshness reader and public schema/API/doc in the
same checkpoint. Preserve generated EARS and compiled content bytes. A typed helper missing its declared
source is an error, never an empty union or invented typing.

Execute checkpoint 2 in two source checkpoints, before any palette consumer migration:

- **2A:** authored frontend data and binding generation, explicit type/helper sources, checked installed
  frontend bindings, and removal of `StepFEFacet.loadComponents` plus its host execution path. Components
  are bound directly, with declared lazy wrappers. Retire factory-only tests; retain atomic refusal and
  incumbent-resource coverage through real ownership/binding failures. Exercise a real external build,
  source-free inspection, declared callback/component failures, layouts and default/runtime parity.
- **2B:** native step declaration/admission and shared catalog/window projections across native, installed
  and source owners. Audit and close the current unchecked native frontend composition path; test-only
  fixture composition may extract authored test data before binding, never synthesize production discovery
  from activation. Preserve explicit ownership/collision rules, data capture, eligibility and revisions.
  This work remains required in this goal; 2A does not claim native/full step discovery is complete.

Then execute checkpoint 3's live palette/style/default/layout reader migration, including ownership and
readiness for executable components/callbacks and removing permanent active-registry caches. Full trigger/
build metadata, all other contribution kinds, source execution/freshness, editor readiness, navigation,
boundaries and all Phase 6 workstreams remain required. Deferred activation/security/storage stays deferred.


### Frontend step checkpoint 2A outcome (2026-10-15)

`cda9fa00e` implements the authored contract above: inline frontend data, checked icon/component/layout
bindings, explicit step type/custom-helper modules and removal of frontend facet factories and directory
inference. All 15 declarations preserve previous static fields/loading modes/layout slots; all seven
baseline EARS/content files and the default-pack facade report are unchanged. Actual source-free external
inspection followed by supported host admission, lazy component/layout execution and unload passes.
Three guard mutations fail as intended and exact source is restored. Strict checkpoint and committed-source
strict validation pass; the owning goal records counts, runs and the corrected test-boundary failure.

Proceed to **2B**, not palette migration: declare/admit native steps and project them through the common
catalog/window inventory with source/installed ownership, captured metadata, eligibility and revision
semantics. Close unchecked native frontend admission before consumers depend on this projection. Then
execute checkpoint 3's live readers/cache removal. Full trigger/build metadata and every other remaining
goal workstream stay required; no phase is complete or archived here.


### Native step/catalog admission audit and execution order (2026-10-15)

At `cda9fa00e`, native declarations have no steps; frontend native checking consequently cannot compare
step metadata. Backend native admission checks data/settings/lifecycle but ignores steps. Both runtime
indexes use the generic last-wins/facet-folding owned store, allowing another pack to supply part of the
same step wire. Captured step tuples still retain the caller's mutable node/presentation objects. The
window catalog already owns immutable frames and caches projections per committed snapshot.

Use the existing `StepEntry` schema/type for native `steps` as for authored `extensions.steps`; no second
shape, executable inference or fake native build. Add a `StepCatalogEntry` per `(packId, type)` with the
complete declared value, origin and the same enablement/declaration/build identity rules as reference
entries. Native composition has no installed build identity. Disabled installed and unbuilt source
entries remain discoverable. The common projection and window reader must agree without imports.
Different inactive owners may declare the same wire: discovery reports both; execution never silently
folds one owner's data into another's implementation. Refuse conflicting active runtime owners before
publishing a candidate, including replacement. Copy node/default/presentation/slot/layout data at
admission while preserving executable component/function identities; later caller mutations cannot
alter accepted metadata or collection membership. Reuse backend step-binding validation for native
composition, including exact node data and facet/handler/flag membership.

Complete checkpoint 2B through these dependent source checkpoints, with no palette migration between:

1. **2B.1 — Native step data and common projection:** shared native step grammar, backend/native frontend
   step comparisons where declarations are admitted, source/installed/native catalog and window projection,
   captured step data and active owner collision checks. Migrate authored native fixtures rather than add
   missing-data defaults to production. Prove declaration-only discovery, disabled/unbuilt entries, stale
   window frames, callback nonexecution, atomic refusals and exact preserved typing/content.
2. **2B.2 — Complete frontend admission authority:** close the existing unknown-native-owner bypass.
   Audit all frontend registration fields before changing its API: native declarations also cannot yet
   represent artifact/block/DSL contributions or feature designations, while native test composition
   exercises them. Give supported native fields the existing shared declaration grammar before enforcing
   complete admission; do not drop those fields, exempt test owners, accept undeclared bindings, or invent
   installed identities for native tests. Pass accepted declarations explicitly or admit them independently
   before binding, retaining pre-settings validation and stale prepared-candidate rejection. Migrate the
   public test-shell composition and native fixture helpers with the production API. Preserve the
   supported installed loader path and remove redundant unchecked paths. Add accepted owner/revision
   binding information needed to match catalog entries to executable components in checkpoint 3.

Each checkpoint includes focused/mutation checks, reviewed schema/API/docs and strict validation before
committing. 2B.1 alone does not close native frontend admission or authorize switching consumers. 2B.2
remains required before checkpoint 3, alongside full trigger/build metadata and all other outstanding goal
workstreams. This ordering exposes the dependency on the rest of the native frontend grammar instead of
hiding it behind optional validation. There are no compatibility aliases, inferred production declarations,
new activation modes or changes to deferred isolation/storage requirements.

The 2B.1 parity test additionally reproduces Zod record decoding dropping an own `__proto__` key from
opaque JSON defaults. Native admission retained the original data while source/snapshot decoding lost
that key. Validate and clone JSON default objects without record decoding for both node and settings
defaults, retaining the existing `Record<string, unknown>` types. Keep the generated JSON Schema's object
shape explicit and test all three declaration origins; this is data preservation, not format conversion.

The final native admission review also reproduced structured cloning normalizing a class-valued default
before schema validation. Validate native declaration JSON purity before any copy: reject accessors without
invoking them, foreign prototypes and other non-JSON values, preserving the prior catalog on refusal.
Check the separately declared trigger registration slot in the shared backend step validator too; full
trigger/build metadata migration remains required and is not replaced by this slot-membership check.


### Native step checkpoint 2B.1 outcome (2026-10-15)

`fdd967ec5` implements the native step grammar and common catalog/window projection above. Data capture,
active ownership and backend/native frontend step comparisons are covered. JSON defaults preserve own
keys across all origins; native and binding data are checked before copying, and declared trigger
registration slots are checked without invocation. Native fixture composition supplies existing node data,
never a production default. Eight mutations fail as intended; all seven baseline EARS/content files and
facade types are unchanged. Strict and committed-source strict validation pass; the owning goal records
counts, reproductions, source commits and runs.

Continue **2B.2** before palette migration. All supported native frontend fields need declarations before
complete enforcement: artifact/block/DSL contributions and feature designations remain absent alongside
the unknown-native-owner bypass. Make accepted declaration authority mandatory for binding operations;
use one explicit tagged native-declaration or backend-loaded-pack input, rather than optional checking or
a special test-owner exemption. Native test composition may build that input before registration through
clearly named fixture operations; its object must still satisfy the production registry interface when
passed to the loader/shell. Provide valid machine/component fixtures, not casts hiding invalid bindings.

Share browser-safe declaration schemas before enforcing native frontend semantics; do not import the
Node build pipeline into the renderer or duplicate its grammar. Keep declaration origin separate from
frontend delivery: a verified installed declaration may be served through the checkout's dev frontend
map. Do not infer its authority/origin from that delivery choice. Preserve validation before settings
access, capture-before-check semantics, stale prepared-candidate checks and accepted owner/revision data
needed to match catalog rows to executable components. All other goal work and deferred-work decisions
remain intact; 2B.1 does not close 2B or discovery.

#### Browser-safe native admission foundation (2B.2)

The current canonical Zod grammar is pure, but its build-directory placement hides that fact and the
`/build` barrel loads Node tooling. Move that grammar and its pure dependency/check-policy parsers into
`framework`, retaining the existing public build exports for their build consumers. Native artifact,
block, DSL and feature-designation fields use the same constituent schemas and inferred types as authored
manifests. Expose a small native-declaration problem checker through `/framework`, including JSON purity
before decoding/copying. The host catalog and frontend admission must use that checker; browser bundling
proves it reaches no Node tooling or authored pack modules. This is a foundation checkpoint within 2B.2,
not closure of its mandatory registration-authority and binding-identity work.

The subsequent mandatory-admission change also owns the capture gap: current frontend snapshots copy
references, editor groups and steps, but retain mutable plugin metadata/routes, artifact/block facet
containers, DSL globals and form/extension slot maps. Capture those containers before comparison while
preserving actual machine/component/function identities. Route maps need accepted declaration context;
a component object must not be guessed to be a route map. Validate in the loader before allocating settings,
and make registry preparation retire provisional host settings on every failure, including declaration or
capture refusal. Tests must mutate each accepted container and prove both retained lookup behavior and
candidate cleanup. This closes the gap rather than merely adding a required argument to unchecked state.


#### Browser-safe foundation outcome (2026-10-15)

`92b2804ae` implements the shared grammar/checker foundation above. Native artifacts, blocks, DSL and
feature designations use authored schemas; native catalog/frontend checks share the browser-safe checker.
A public-framework browser bundle contains neither build tooling nor authored pack modules and executes
its admission checks. JSON purity precedes copying, including the native registry constructor. Public
reports are reviewed; authored schema semantics, EARS/content and facade output are unchanged. Three
mutations, focused checks, strict and committed-source strict pass; the goal records runs and counts.

Next implement the rest of 2B.2 as one coherent admission change: mandatory native/loaded authority,
complete declaration-directed container capture, failure cleanup, valid native fixtures/public shell,
and accepted binding owner/revision data. Do not switch palette readers while optional native-owner
checking still permits unknown registrations. All other discovery and goal acceptance criteria remain.


#### Required admission identity correction (2026-10-15)

The 2B.2 audit reproduced the loader retaining its caller's mutable `LoadedPackEntry` across module
and stylesheet awaits. Changing only runtime/build identities while delivery was pending let old code
claim the new identities; changing declaration metadata instead refused the originally valid binding.
Pin the entry's scalar fields and own its JSON declaration data before asynchronous delivery. Retain
attempt/cancellation handling around this capture; invalid candidates must supersede older attempts
without retiring accepted resources. Source delivery remains independent of declaration authority.
This closes the frontend admission race; complete compiler input/implementation identity and frozen
execution requirements elsewhere in this plan remain required.


The concurrent read-only own-key audit in
[manifest consolidation](manifest-consolidation.md#required-own-key-preservation-correction-2026-10-15)
reproduced `__proto__` entity declarations disappearing during schema decoding. Source `29f0cc556`
closes that preservation gap across authored/native parsing, snapshots, generated bindings and real
source-free installed inspection/loading. The linked outcome and owning goal record its evidence.
The complete remaining discovery/compiler/navigation/boundary/Phase 6 scope stays required.


#### Mandatory admission outcome (2026-10-15)

`e5dcdec63` completes 2B.2: mandatory native/loaded declaration authority, full preparation capture and
cleanup, valid public native test composition, and accepted step binding rows. Identity checks precede
settings binding; JSON checks precede declarative reads/copies. Capture itself is guarded against registry
reentry. Metadata containers are owned while executable identities remain intact. Native bindings have
no installed stamps; backend stamps remain backend identities through development frontend delivery.
The loader pins its entry/declarations before awaits. Getter, cleanup, async identity and reentry
reproductions and ten guard mutations pass; strict and committed-source strict pass. The goal records
source, counts and runs. Public frontend testing has its own host entry, avoiding private test imports
and backend build tooling in the renderer.

The keyed-declaration correction is now committed in `29f0cc556`. Next switch live readers in
checkpoint 3 and remove active-only caches, then finish the full remaining kind/content/asset,
compiler/freshness/scope-cost, native/editor, navigation, boundary and Phase 6 work. 2B.2 does not replace
those acceptance criteria or final committed-source strict `--all` validation.


### Live step reader implementation (2026-10-15)

Checkpoint 3 reads declared node/presentation/layout data from the common catalog. A unique native or
installed owner takes precedence over authoring-source previews; ambiguous runtime owners yield no
selected contribution. Metadata remains readable when disabled or disconnected. Executable frontend
bindings require a ready catalog, enabled runtime owner, matching pack/type and accepted declaration
and build identities. Native entries have no fabricated stamps and must match captured declaration data.
Reading or subscribing never loads a component, evaluates layout or starts a provider.

The SDK owns these selection/readiness rules. A scoped reactive step reader observes catalog and
frontend publications independently and releases both subscriptions. UI node-style helpers keep their
imperative reads fresh; a scoped composable supplies the same helpers to Vue consumers with reactive
catalog tracking. Remove permanent node/color caches and the nodeConfigs proxy rather than add an
invalidation protocol. Palette/menu defaults are computed, and open nodes/forms refresh on publication.
Retain unavailable metadata with disabled creation and a host fallback icon/component; custom code
requires current eligible bindings. Static layout flags come from declarations, callable layout from the
eligible binding. Do not remove actual backend/runtime execution lookups in this frontend reader change.

Prove native/source/installed parity, duplicate owners, source-preview precedence, every readiness and
identity refusal, source-free/poisoned executable metadata, replacement/unload/re-enable, and scoped
subscription cleanup. Exercise mounted consumers, real external authoring and app paths; preserve
ordinary node creation, EARS types and compiled-content baselines. Backend creation defaults, obsolete frontend step lookup removal and full trigger/build metadata remain
required subsequent work. This frontend checkpoint is 3A, not completion of checkpoint 3 or the goal.


Mounted pack-component checks belong to the pack's suite. Its frontend project compiles Vue in jsdom
without the backend harness; ordinary specs keep Node and SFC stubs. Both resolve published packages.
Use workspace-qualified project names (`<workspace>:backend` / `:frontend`); the duration reporter
attributes those only when the root package.json confirms ownership. Unrelated names retain their
refusal, and collection/input guards remain intact. Do not place these specs in the renderer or broaden
its dependency inputs to accommodate private pack-source imports.


#### Live frontend step reader outcome (2026-10-15)

Source `76df2f0e5` completes frontend reader checkpoint **3A**. SDK selection returns one unambiguous
runtime owner ahead of source previews. Disabled/disconnected metadata remains readable; bindings
require matching owner, declared data and accepted identities. Native data equality has no fabricated
stamps. The scoped reader observes both publication sources and releases both subscriptions.

Node styles, palettes, menus, node/form selection, frontend creation defaults and brain presentation now
use declarations and eligible bindings. Permanent node/color caches and both contribution proxies are
removed. Static layout flags survive unavailable code; retained descriptors cannot invoke retired or
replaced callbacks. Ordinary EARS/content baselines and facade are unchanged. Mounted pack-owned
Vue checks, full backend/frontend pack tests, five guard mutations, real installed step disable/re-enable,
API reports and strict/committed-source strict all pass; the owning goal records counts and runs.

Next complete **3B**: audit/migrate backend creation defaults through committed declarations and actual
provider eligibility, and retire the now test-only frontend `stepRegistry.getFE/getComponent/getFormComponent`
methods through the checked frontend API. Audit the remaining shared active-registry paths before
removing them; preserve genuine runtime/compiler execution. Full trigger/build metadata, remaining
contribution kinds/content/assets, exact compiler/input/frozen-publication and freshness work, native/editor
lifecycle, navigation, boundaries and all Phase 6 workstreams stay required. No phase or goal is archived.


### Backend step reader design, checkpoint 3B (2026-10-15)

Expose declaration rows and captured accepted backend bindings as separate read-only ports on the
backend registry. Share pure owner selection with the frontend. Defaults and node labels read only
committed declarations, including unavailable providers; reading them activates nothing. New node
creation requires a matching active backend owner before relation handling, trigger validation or writes.
Capture declaration data and accepted identities during admission, before user binding callbacks, and
retain those rows through existing atomic replacement/retirement. Do not reconstruct accepted metadata
from changed origin objects or disk.

Source execution in the harness is intentional: it has an accepted declaration revision and actual
runtime generation, without an installed build receipt. Compiled dependency declarations can likewise
lack a build receipt in this harness. Match optional build identities exactly; do not invent installed
stamps. Native bindings use their actual runtime generation and captured declarations, with no installed
version/build metadata. Unavailable/foreign/stale bindings cannot authorize a new write.

Make `stepRegistry` backend-only, remove unused frontend facet/component methods and migrate their
tests to frontend binding APIs. Preserve actual active runtime/build lookups for in-flight work and
compiler execution; they are not metadata discovery. Test stand-ins declare metadata explicitly rather
than deriving declarations from execution maps. Prove no provider invocation during reads, data survives
unload, replaced/disabled/foreign owners refuse creation without writes, valid source/native/installed
paths work, and normal defaults/validation/relations remain intact. Keep the full remaining discovery,
compiler, navigation, boundary and Phase 6 scope active.


### Backend step reader outcome, checkpoint 3B (2026-10-15)

Implemented in `71fad4013`: backend metadata/defaults use the catalog, while new writes require a
current accepted backend generation. Raw execution/retirement keeps its own lifetime. Backend and
frontend ports are separate; each registry stores accepted binding rows once, with exclusive ownership.
Accepted origin/declaration/relation/query-field data is captured before callers can mutate it. Test
stand-ins author metadata explicitly. The installed fixture proves backend-confirmed defaults and
continues to follow disable/re-enable.

Strict validation passes all 30 steps, run `2026-10-15T18-05-11Z-9023`; committed-source strict passes
again, run `2026-10-15T18-11-45Z-25483`. Full counts, corrected fixture assumptions, guard mutations and
logs are recorded in the owning goal's checkpoint 3B entry. Seven EARS/content baselines stay identical.

Next finish full trigger/build metadata, then remaining contribution/content/asset readers and their
binding/freshness rules. Compiler closure/frozen publication, source watch/manual-build/drive freshness,
native/editor lifecycle and the goal's navigation, frontend boundaries and three Phase 6 workstreams
remain required. This reader checkpoint does not complete discovery or authorize archiving the plan.
