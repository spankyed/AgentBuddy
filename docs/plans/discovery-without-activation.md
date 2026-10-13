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
| References | A feature names an executable reference module | Declare protocols, categories, labels, icons and provider/navigation bindings currently exported from that module |
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
