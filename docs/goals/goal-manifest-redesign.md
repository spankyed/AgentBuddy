> **Written in session** `23ab84ee-4c28-4dde-8ea9-641d6aa004cd` (Claude Code, 2026-09-19). Resume it with `claude -r 23ab84ee-4c28-4dde-8ea9-641d6aa004cd`.

```
# Goal: abuddy.json has a shape, not a pile of keys

Implement docs/goals/goal-manifest-redesign.md on AS/external-pack-authoring, at or after 4f24d04f7 —
the base its Background was surveyed at. Two decisions have landed since that survey — Decision 6
(`validate.ts`) and Decision 12 (`b8d66af4e`, the default plugin) — and Background and the Phases mark
what they changed; everything else Background describes was still true at 4f24d04f7 — confirm the names
a phase acts on exist before acting.
Read Background, Decisions, Open decisions, Phases and Constraints first, and
docs/goals/goal-manifest-redesign.example.json, which is the finished shape for the built-in pack.
Decisions are final: implement them, don't reopen them or stop to ask. The two Open decisions must be
settled with the user before Phase 1 starts.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility anywhere: no dual-read of old and new keys, no deprecation window, no
migration of an installed pack's manifest. Nothing has shipped — the newest tag is v0.3.14 and it
predates the pack machinery entirely. Change the schema, update every manifest in the repo in the same
change, and fix forward.

Finished when:
- Phases 1, 3–6 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked. **Phase 2 has landed** (`a6aad1e4a`) and Phase 7's first bullet with it; read
  *What the manifest already is* for what that leaves.
- `settingsSections` and `help` are placed deliberately — Decision 9 names neither, and they are the
  one question this goal does not answer. Settle it before Phase 6.
- packages/default-setup/abuddy.json has exactly these top-level keys, in this order and no others:
  $schema, id, name, version, description, license, builtIn, hostVersion, data, features, extensions,
  content, lifecycle, migrations, build. No key holds a map whose keys equal its values. (`checks` is the
  schema's sixteenth root key and this pack has none: it switches off no rule, so the section is absent
  rather than empty.)
- Every feature carries an `about` line, and every entity is declared once — on the feature that owns
  it, or in `data.entities` when no feature does — as a shape reference or null.
- No entity gains or loses a typed shape: the generated src/__generated__/ears.ts is byte-identical.
- No manifest in the repo spells a module reference two ways: `path#export` is the only form, and a
  bare path means the module's default export.
- `features.<id>.designation` is a string that need not equal the feature id (already true at the base
  commit — Decision 6 landed ahead of the phases), and no manifest or schema spells `designated`.
- `abuddy.checks.json` exists nowhere — in no pack, scaffold, fixture, doc or reader — and the rules a
  pack switches off are `checks.allow` in its manifest.
- `$manifestVersion` exists in no manifest and no schema, and neither `verifyPack` nor the loader uses
  `Math.floor` on the format stamp.
- `FEATURE_LAYOUT` is the one definition of the feature layout; `validateFeatures`, `generate-entries`,
  `doctor` and `abuddy add feature` all resolve through it, and a spec fails when the documented table
  and the constant disagree.
- An entity is volatile by carrying `"volatile": true` beside the entity's shape, and any pack may mark
  one it declares — Decision 5's addition, which is all that is left of it, and which that decision
  says to settle again before implementing.
- Every feature lists what it contributes in one `provides` line, no feature key holds the value
  `true`, every path inside a feature is relative to that feature's directory, and a feature on the
  conventional layout spells out no path at all.
- npm run schema:check passes with the regenerated abuddy.schema.json committed.
- npm run api:update has been run and etc/*.api.md committed in every phase that changed the schema:
  PackManifest is published API, and npm run typecheck fails on a stale report until you do.
- npm run typecheck, npm run test:unit, npm run build, npm run test:external-pack and
  npm run test:packaged-authoring all pass.
- docs/public-facing/manifest.md describes the new shape and nothing of the old one.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- accept both an old and a new spelling of any manifest key, even briefly.
```

# Goal: abuddy.json has a shape, not a pile of keys

The manifest works, and it grew one key at a time. It was 23 top-level keys over 552 lines for the
built-in pack, with four concerns interleaved at the same level, three different ways to name a module,
and two maps that carry no information. It is now 19 keys over 711 lines: one of the four concerns is a
section, and the growth is `extensions`' entries carrying what seven barrels used to. This goal gives it
a shape a pack author can hold in their head: 15 top-level keys, worked out in full in
`docs/goals/goal-manifest-redesign.example.json`, which is default-setup's manifest rewritten to the
shape the Decisions specify — with the keys that have landed shown as they really are. That file is the
target; read it beside them.

Almost all of it is moving what a pack already declares. Two decisions do change what a pack *can*
declare, both by removing a restriction rather than adding a feature: an external pack may mark its
own entity volatile (Decision 5, now the only part of it left to do) and a feature's designation need
no longer equal its id (Decision 6, landed). Nothing a pack can express today stops being expressible.

## What the manifest already is

**Five of this goal's seventeen decisions have landed, so Background below describes a tree that has
moved and every measurement in it has been re-taken.** The manifest is 711 lines and 19 root keys, the
schema 22 — against 552 and 23/28 at the survey.

| Decision | State |
|---|---|
| 6 — `designation` need not equal the feature id | landed before the phases |
| 12 — `defaultPlugin` moves onto its plugin | landed in `b8d66af4e` |
| 9 — every extension point under `extensions` | **landed** in `a6aad1e4a` |
| 17 — `build` for what the app never loads | **half landed**: `build.bundleUi`; `checks` is open |
| 10 — every content concern under `content` | **half landed**: all four keys are there; `boot` → `lifecycle` is open |
| 5 — `partitionPolicy` → `volatile` on the entity | **its removal happened elsewhere**: the key exists in no manifest, schema or reader. What it was also going to *add* — an external pack marking its own entity volatile — is open, and `SDK_EXCLUDED_ENTITY_TYPES` is still the only list |

**Decision 9 arrived with more than the grouping**, which is why Background's "three encodings" and
"paths repeat their own location" are the sections to read before Phase 4 or 5: `features`, `steps`,
`blocks` and `artifacts` are each now a keyed map of individual declarations, every entry naming its own
facets by `"path#export"`. The step, block and artifact barrels and the step `index.ts` files are gone,
a duplicate id or type is unrepresentable, and a contribution key found at the root is refused with the
name it moved to (`_MOVED_ROOT_KEYS`, `manifest-schema.ts`).
[`docs/reference/declarative-contributions.md`](../reference/declarative-contributions.md) records the
shape; [`extensions.md`](../public-facing/extensions.md) and
[`manifest.md`](../public-facing/manifest.md) document each key.

**A second plan proposes a different answer to part of this**, and the two should not be implemented
blind to each other: [`manifest-convention-first.md`](../plans/manifest-convention-first.md) replaces
Decision 7 — `provides` plus feature-relative paths become no paths at all — and adds a resolved manifest
the build writes. It keeps Decisions 1, 2, 3, 4, 8, 10, 11, 13, 16 and 17, and its own table says which.
Read it before Phase 4 or 5.

**One thing is out of scope rather than open: the format constants.** `PACK_LAYOUT_VERSION` and
`PACK_SNAPSHOT_FORMAT` are not to be renamed or bumped, by the owner's decision, so Decision 14 is the
deletion of `$manifestVersion` and nothing else.

What is left is the decisions about `data` (3, 4, 5's addition), the feature shape (7, 8, 13), one
encoding (2), `lifecycle` and the root key *order* (1), `checks` (17),
`$manifestVersion` (14) and the schema-as-specification work (11). Confirm each name a phase acts on
before acting; several no longer exist.

## Background (surveyed 2026-09-19 at 4f24d04f7; measurements re-taken 2026-10-10)

`packages/default-setup/abuddy.json` is 711 lines and 19 top-level keys. The schema is
`packages/abuddy-sdk/src/build/manifest-schema.ts` (455 lines), which generates
`packages/abuddy-sdk/abuddy.schema.json` (`npm run schema:update`, checked by `npm run schema:check`)
and allows 22 root keys.

Manifest consumers: `abuddy-sdk/src/build/generate-entries.ts` (most of it), `manifest.ts`
(`PROVENANCE_KINDS`, over the hand-written `ProvenanceManifest`), `manifest-schema.ts`'s own
`superRefine` (20 issues it can raise), `validate.ts` (`parseManifest` and `_MOVED_ROOT_KEYS`'s hint),
`manifest-bridge.ts`, `abuddy-cli/src/commands/build.ts`,
`add/{manifest,step,artifact,block,feature,service}.ts`, `info.ts`, `doctor.ts`, `init.ts`,
`init-tests.ts`, `build/dsl-defs.ts`, `build/fe-bundler.ts` (`build.bundleUi`, read from the JSON),
`build/pack-features.ts`, `abuddy-host/src/packs/runtime/loader.ts`,
`features/packs/be/system.ts` (two `PackInfo` builders, over an untyped `readManifest`),
`abuddy-host/src/database/schema.ts`, `migrations/app/0.3.15.ts` (`declaredFeatureRefs`) and
`@abuddy/testing`'s `harness.ts` (`declareFeatures`) and `index.ts` (the fixture's plugin ids).

Two of those read a manifest through a type that is **not** `PackManifest` — `ProvenanceManifest`'s own
optional fields and the packs system's `Record<string, any>` — so they do not fail to compile when a
key is removed. Decision 3 covers what that costs.

Every other manifest a phase has to change — **four hand-maintained, two generated**:

| Manifest | Size | Notes |
|---|---|---|
| `tests/packs/external-pack/abuddy.json` | 101 lines | two features, `memos` and `notes` |
| `tests/packs/bundled-ui-pack/abuddy.json` | 23 lines | one feature, `scribbles`, no system; the one manifest that sets `build.bundleUi` |
| `packages/default-setup/tests/_support/fixtures/dependent-pack/abuddy.json` | 22 lines | no features; root keys are `$schema, id, name, version, hostVersion, dependencies, content` |
| the `abuddy init` scaffold | — | a template literal, `abuddy-cli/src/commands/init.ts`'s `MANIFEST_TEMPLATE` |
| the packaged-authoring pack | — | built by `abuddy init` then edited by `tests/scripts/test-packaged-authoring-author.sh` |
| `tests/packs/external-pack/.abuddy/bundle/e2e-fixture/abuddy.json` | — | a build artifact; regenerated, never edited |

Besides those, two in-process fixtures stand in for a manifest and move with the shape:
`@abuddy/sdk/testing`'s `packFixture` (`DEFAULT_MANIFEST`) and the `manifest()` helper in
`generate-entries`' own spec support, which keys `features` and groups the contribution keys so a case
can write either flat.

Fixtures also use `dependencies` and `permissions`, which default-setup does not. A phase that says
"every manifest" means the first five rows.

### Measured problems

**Two maps carry no information.**

- `entities` is an identity map: all 12 keys equal their values. `abuddy init` scaffolds it that way
  (`init.ts:18`, `entities: { [pascalName]: pascalName }`).
- `relKinds` maps SCREAMING_SNAKE to snake_case (`PARENT_OF: "parent_of"`), which is mechanical. The keys
  are load-bearing — they become `EARS.RelKind.PARENT_OF` in `__generated__/ears.ts:47-67`, used in pack
  code — but codegen can derive the constant from the wire value.

**One concept is declared in two places.** `entities` lists 12 names; `entityShapes` types 10 of them,
keyed by the same names. `SearchIndex` and `IndexedDoc` have no shape.

**`designation` is always the feature id, because a validator says it must be.** ~~Five features
declare one and all five match — `validate.ts:55-57` rejects anything else.~~ **Fixed since the survey
(Decision 6): that check is gone**, replaced by one that rejects a role claimed twice in a pack. The
measurement is kept because it is why the field looked redundant enough to delete, and the deletion
would have been wrong. Nothing below the check ever required the equality: `designationsOf`
(`abuddy-host`'s `packs/registry.ts`) maps `[designation, systemId(id)]` as two values, and codegen carries
them apart (`generate-entries.ts:630`, `:642`). The redundancy was the validator's, not the field's.
All five designations still equal their ids, so no manifest changed.

**Three encodings for "a module and its export".**

| Thing | Form |
|---|---|
| `services`, `repositories`, `content.writers`, `extensions.services`, a step's and a block's facets | `"src/features/threads/be/services/chat.ts#chatService"` |
| `system.entry`, `plugin.entry`, `references`, a block's and an artifact's `fe` | `"src/features/threads/be/system.ts"` |
| `entityShapes` | `{ "source": "src/features/threads/be/types.ts", "type": "ThreadEntity" }` |

The contribution keys landed on both of the first two: a facet whose export has a name takes
`path#export`, and one taken by its module's default export — a `.vue` component — takes a bare path.
That is Decision 2's rule already, applied in one section; the open half is `references`,
`entityShapes` and the two feature entries.

**Paths repeat their own location.** 100 path strings begin `src/features/<id>/`. Fifty-nine of them are
a feature's own declaration (`system.entry`, `system.contract`, `plugin.entry`, `plugin.contract`,
`settings`, `references`, `typesEntry`) and **all fifty-nine are the conventional path** — no feature in
the pack puts a file anywhere else. A feature's id is already the directory name.

**No pack can say an entity of its own is volatile, and the key that looked like it could is gone.**
`partitionPolicy.excludedEntityTypes` existed, was declared empty by the one pack whose value was read,
and was stripped from every external pack by the loader; it now appears in no manifest, schema or
reader. The only exclusion that takes effect is still `SDK_EXCLUDED_ENTITY_TYPES = [TNode]`
(`sdk-entities.ts:39`), applied by the host regardless of any manifest — so Decision 5's *addition* is
what remains of it, and the evidence for why the old key could not be kept is worth reading first.

That list was unscoped in both directions: the schema accepted `z.array(z.string())` and the registry
concatenated every registration's entries into one global list with no check that a pack named an entity
it owns. A pack writing `"excludedEntityTypes": ["Note"]` would have routed another pack's Notes to
`volatileBackup`, which `makePolicy` does not hydrate (`policy.ts:28`) and `exportDatabase` does not
back up (`backup/index.ts`, `databases = ['lmdb']`). Entity-type ownership *is* enforced at registration
(`abuddy-host/tests/packs/registration.spec.ts`), so the scoping exists; the policy list simply did not
use it, and whatever replaces it has to.

**And the word is "unread", not "lost".** The old field's description said "excluded from persistence
(in-memory only)", and `volatileBackup` is an on-disk LMDB store (`envs.ts`) the sink writes like any
other: it is not hydrated at boot (`policy.ts:28`) and not in backups, and `abuddy db --volatile` reads
it. Anything written from that description — including the first draft of this goal — treats volatile
data as lost when it is only unread.

**Four concerns were interleaved at the top level, and one of the four is now a section.** By weight in
lines, measured 2026-10-10:

| Concern | Keys today |
|---|---|
| extension points | `extensions` (346: `steps` 133, `artifacts` 66, `blocks` 65, `dsl` 64, `commands` 10, `fe` 7) |
| features | `features` (198) |
| applying | `content` (90: `sources`, `artifacts`, `formats`, `writers`), `boot` (3, holding `hooks` alone) |
| data model | `entityShapes` (38), `entities` (13), `relKinds` (5) |
| identity | `id`, `name`, `version`, `description`, `license`, `builtIn`, `hostVersion`, `$schema` |
| other | `migrations`, `settingsSections`, `help`, `build` (5) |

So the extension points are one key, and applying is two rather than four. What is still flat is the
data model (Decisions 3–5), `migrations` and `boot` (Decision 1's `lifecycle`), and `settingsSections`
and `help` — the two contributions Decision 9 did not name, which is the one question this goal does not
answer.

The table is what default-setup uses. The schema allows **22** root keys: those 19 plus `dependencies`
and `permissions` (fixtures only) and `$manifestVersion` (`z.literal(1).optional()`, "Enables future
format evolution" — **read by no code and set by no manifest**; its only appearance anywhere is its own
declaration).

### Prior art the design follows

- **package.json** keeps identity flat at the root and groups everything else by concern (`scripts`,
  `dependencies`, `exports`).
- **VS Code's extension manifest** puts every extension point under one `contributes` key, whatever kind
  it is. That is the closest analogue to `steps`/`artifacts`/`blocks`/`fe`/`commands`/`dsl`.
- **Cargo** uses named sections (`[package]`, `[dependencies]`, `[features]`) rather than a flat table.
- **Convention over configuration** (Rails, Next.js app router): a conventional layout is declared by
  existing, and the manifest names only the exceptions.

## Decisions

Final.

**1. The root says what the pack *is*; every other key is one concern, and a section has to earn it.**

> A root key is the pack's identity, what it requires, or what it may do. Everything else is one key
> per concern. A concern becomes a section only when it passes all three of these:
>
> 1. it answers **one question a reader actually asks**;
> 2. its absence would mean **searching several keys** for that answer;
> 3. its members **change together**.

Four sections pass: `data` (what the pack adds to the EARS namespace), `features`, `extensions` (what
it gives the host) and `content` (what data it ships). `lifecycle` and `migrations` do not — two keys is
not a search and neither changes with the other — so they stay flat rather than being wrapped in a
container invented for tidiness.

Root after this goal, in this order:

```
$schema
id  name  version  description  license        who it is
builtIn  hostVersion  dependencies  permissions   what it needs
data                                             what it adds to EARS
features                                         what it is made of
extensions                                       what it gives the host
content                                             what data it ships
lifecycle  migrations                            what runs, and how its data moves
```

`dependencies` and `permissions` are optional and default-setup declares neither, so its manifest has
fourteen of these sixteen; the order is the same either way.

**The order is part of the format, not a convention.** Nesting and navigation are different problems,
and reaching for nesting to solve navigation is what produces containers like `lifecycle`. A flat root
reads fine when its order tells the pack's story — this repo's own `package.json` has 12 root keys and
no sections, and nobody finds it unnavigable, because the ecosystem settled on a conventional order
(the one `sort-package-json` encodes) rather than on nesting. Every
`abuddy add` subcommand that edits a manifest writes it through one line (`writeManifest`,
`add/manifest.ts:7`), so the order is enforced in one place, which also makes manifest diffs stable.

An earlier draft of this decision said "identity at the root, everything else in sections" and then
left keys at the root that its own rule sent into sections, papered over with the invented term
"scalar identity field" for whichever ones it wanted to keep. A rule that needs a coined term to
explain its exceptions answers nothing. This one answers where a new key goes, which is its only job:
`migrations` and `lifecycle` sit at the root not by exception but because neither passes the test.

The enforcement is not the prose. Phase 6 adds a spec naming the exact root keys and their order, which
a later author cannot reinterpret the way they can reinterpret a principle.

**2. One encoding for a module reference: `"path#export"`.** A bare `"path"` means the module's default
export. `entityShapes`' `{ source, type }` object goes. Every place that names a module — services,
repositories, systems, plugins, references, content writers, content compilers, step definitions, DSL entries,
migrations — uses the same form, and the schema validates it with one shared refinement.

**3. `entities` and `entityShapes` merge into one map, which lives on the feature that owns the
entity.** Two keys hold one fact today — the entity type and its shape — and one of them is an identity
map, all twelve keys equal to their values. They become a single map from entity name to shape
reference, `null` when the entity has no typed shape:

```jsonc
{ "id": "library",
  "about": "Documents and collections, with a dormant semantic search index.",
  "entities": {
    "SearchIndex": null,
    "IndexedDoc": null,
    "Document": "be/types.ts#DocumentEntity",
    "Collection": "be/types.ts#CollectionEntity"
  } }
```

**`null` means the entity type exists in the database and has no registered EARS shape**, so queries
for it come back untyped. It is not a placeholder: it is the manifest reporting a gap in the code
accurately, the same gap today's manifest reports by listing the name under `entities` and skipping it
under `entityShapes`. `SearchIndex` and `IndexedDoc` are the two, and they stay `null` through every
phase of this goal.

**This goal grants no new types, and takes none away.** Moving a declaration from one key to another
changes who the manifest says owns an entity — information for a person reading the file — and changes
nothing the compiler sees. Every entity that is typed today is typed after, by the same shape; every
entity that is untyped today is untyped after. Phase 1's check is exactly this: a byte-identical
generated `ears.ts`. A phase that improves inference has gone outside its scope.

**The feature is the home because the entity has an owner, and the manifest should record it.** All
twelve of default-setup's entities live in exactly one feature's directory — including `SearchIndex`
and `IndexedDoc`, whose code is `src/features/library/be/search-index/`, and whose ownership is
invisible today precisely because they have no shape path to disclose it. The other ten disclose it
only by accident, in a path prefix: a pack-level `"Note": "src/features/notes/be/types.ts#NoteEntity"`
repeats `src/features/<id>/` for every typed entity, which is the redundancy Decision 7 removes
everywhere else. On the feature, the same line is `"Note": "be/types.ts#NoteEntity"`.

**`data.entities` stays, and it is where every pack starts.** This is not a hedge against an imagined
pack: `abuddy init` scaffolds `features: []` with one entity, content rows of it through `content.formats`,
and only then tells the author to run `abuddy add feature` (`init.ts:18-20`, `init.ts:386`). So the
scaffolded shape is exactly an entity with no feature to own it, and the pack-level map is the one a
new pack is born with. Entities move onto features as the pack grows a structure to hold them;
default-setup is the far end of that path, with all twelve placed, which is why it has no
`data.entities` at all. A pack that never grows features — one contributing only a data model and an apply — simply stays
where it started.

`abuddy add feature` does not relocate an entity: that would edit a declaration the author did not
name. `abuddy doctor` reporting a pack-level entity whose shape lives inside a feature's directory is
the right nudge, and it is a suggestion, not an error.

**Exactly one home per entity.** An entity declared both on a feature and in `data.entities` fails
`validate`, naming both. Entity types stay pack-global and collision-checked pack-wide (`checkEARS`,
`abuddy-host`'s `packs/registry.ts`, checks entities and relation kinds in one loop), so the split home
changes where a name is written, never what it is scoped to.

**The merge exists once, and two readers will not tell you when they miss it.** Twelve call sites
across three packages read `manifest.entities` today — `generate-entries.ts` (four), `manifest.ts`'s
provenance builder, `manifest-schema.ts`'s `content.writers` refinement, `build.ts`'s snapshot,
`abuddy-host`'s `database/schema.ts` (two), `packs/runtime/loader.ts` and `features/packs/be/system.ts` (two, which
feed the Packs view's `entityCount` and entity list). Every one must see the same set, or the build and
the running app disagree about what a pack declared. So the phase adds one exported helper —
`packEntities(manifest)`, returning the merged map — and every reader calls it; `@abuddy/host` already
imports `@abuddy/sdk/build` at runtime in three modules, so nothing new is dragged in.

Deleting the root `entities` key makes ten of the twelve a compile error, which finds them for you.
**The other two keep compiling and return nothing, and they are the two that matter most:**

- `ProvenanceManifest` (`manifest.ts:89-94`) is a hand-written structural interface — "the parts of a
  manifest `PROVENANCE_KINDS` reads" — with its own optional `entities?: Record<string, string>`. A
  `PackManifest` without a root `entities` still satisfies it, so nothing fails to compile and
  `PROVENANCE_KINDS.entities` starts returning `[]` for every pack. Provenance is what records which
  pack declares each name, so the damage is a dependent's codegen and the collision messages, both of
  which degrade quietly. Update this interface in the same commit as the schema.
- `features/packs/be/system.ts`'s `readManifest(dir): Record<string, any> | null` is untyped, so
  `manifest?.entities` compiles forever and yields `undefined`. This is the `entityCount: 0` case, and
  it is the one a user sees. Give that function a real return type while you are in it.

**The snapshot stays flat.** `build.ts:189` merges the manifest's entities with each dependency's
`snap.types` (`PackTypeManifest`), which is a single flat map and must remain one: the split is how a
pack *author* writes a manifest, not how a compiled pack publishes its names, and every dependent's
`EntityName` comes from that flat form. Propagating `data`/`features` into `PackTypeManifest` would
break dependent codegen for no gain.

**The helper is total; `validate` is where a duplicate is an error.** An entity declared both on a
feature and in `data.entities` fails `validate` at build time (above). `packEntities` itself never
throws — the host calls it at boot on manifests it did not build, and refusing to start over a
malformed manifest is worse than starting with a deterministic merge. Define the precedence (feature
first, then pack level) and spec it, so two implementers cannot pick differently.

There is a thirteenth reader, and it disappears: `entitiesWithoutShapes(manifest)`
(`generate-entries.ts:332`, a published export) exists only to compute which entities are in `entities`
but not in `entityShapes`, which `build.ts:247` prints as a build note. With one map and `null` that is
`Object.entries(packEntities(m)).filter(([, v]) => v === null)`. Keep the build note — it is how an
author learns their rows read as unknown values — but rewrite its message, which names `entityShapes`.

A spec asserts no reader open-codes the merge, the way `check:specifiers` guards the other
single-source lists. Keep its pattern narrow — `manifest.entities` and `manifest?.entities`, not a bare
`.entities`, which matches the engine's `ears.entities`, the store's `envs.<p>.entities`, the trace
store and `getSchemaStats`.

**4. `relKinds` becomes `data.relations`, a list of wire values, and stays at pack level.**
`["parent_of", "has", "relates_to"]`. It is the other identity map — `{ "PARENT_OF": "parent_of" }` —
and the key was always derivable: codegen builds the `EARS.RelKind.PARENT_OF` constant by upper-casing
(all three of default-setup's follow that rule today, and the schema requires it).

It does not move onto a feature, because a relation kind has no owner in the way an entity does:
`parent_of`, `has` and `relates_to` are a vocabulary the whole pack links with, and the same kind joins
two features' entities. An entity is declared by whoever holds its data; a relation kind is declared by
the pack. That is why `data` keeps a section rather than dissolving: it holds the pack-level half of
the data model, which for default-setup is `relations` alone. A section is defined by the vocabulary a
manifest may use, not by how much of it one pack fills — `extensions` holds one key in a small pack too.
The phase proves the generated `ears.ts` is unchanged.

**5. `partitionPolicy` becomes `volatile` on the entity that is volatile, and every pack may use it.**

> **This decision's subject no longer exists.**
> [`goal-one-kind-of-pack`](../archive/goals/goal-one-kind-of-pack.md)'s Decision 5 deleted `partitionPolicy` outright —
> the manifest field, `PackEARS.partitionPolicy`, `getRegisteredEARSPolicy` and the registry's policy
> member. `appPartitionPolicy()` survives as a constant in `abuddy-host/src/database/open.ts` over
> `SDK_EXCLUDED_ENTITY_TYPES`, and no pack contributes to it. So this is no longer *moving* a capability
> onto a better declaration; it is **adding** one that nothing has asked for — which is the test the other
> goal applied in deleting it. The plumbing this paragraph calls "unchanged" is the plumbing that went.
> Decide it again before implementing it, against an actual volatile entity someone wants.


The section goes; the capability moves onto the declaration it describes:

```jsonc
{ "id": "code",
  "entities": {
    "Terminal":   "be/repository/index.ts#TerminalEntity",
    "Scrollback": { "shape": "be/types.ts#ScrollbackEntity", "volatile": true }
  } }
```

(`Scrollback` is illustrative — default-setup declares no volatile entity today, which is why
`partitionPolicy.excludedEntityTypes` is empty and the section disappears from its manifest entirely.)

An entity's value is a shape reference, `null` for no typed shape, or an object carrying `shape` and
`volatile`, wherever the entity is declared (Decision 3: its feature, or `data.entities`).
`generate-entries` would derive the exclusion from the entities marked volatile — but the plumbing this
paragraph was written against is gone (see the note above): `PackRegistration.ears` carries no policy,
`getRegisteredEARSPolicy` does not exist, and `appPartitionPolicy()` is a constant over
`SDK_EXCLUDED_ENTITY_TYPES` that takes no contribution. So this decision now has to *build* the route it
assumed, and the SDK's own `TNode` exclusion is the only thing that stays where it is.

**The restriction on external packs went with the key**, and the reason it existed is the reason the
replacement has to be scoped: the exclusion list was unscoped in both directions — the schema accepted
`z.array(z.string())` and the registry pushed whatever a registration named into one global list. A pack
writing `"excludedEntityTypes": ["Note"]` would have routed another pack's Notes to `volatileBackup`,
which is not hydrated at boot and is outside backups — real destruction of data the pack does not own.

A property on the entity cannot do that. A pack can only mark an entity it declares, and `registerPack`
already refuses a declaration another pack or the SDK owns (`EARS collision: entity type "Thread" —
pack "older-pack" vs "base-pack"`, `tests/packs/registration.spec.ts:157-171`). The hazard stops being
mitigated and becomes unrepresentable, which is why the restriction can go rather than being restated.

Two effects stay, both inside the declaring pack, and the schema's description has to state them
correctly — the deleted field's did not. It said "excluded from persistence (in-memory only)", and that
is wrong: `volatileBackup` is a real on-disk LMDB store (`envs.ts:97`) written like any
other. What `volatile` means is **persisted to a store that is not hydrated at boot** (`policy.ts:28`,
`hydrate` defaults to `['primary']`) **and not included in backups** (`exportDatabase` defaults to
`['lmdb']`). `abuddy db --volatile` reads that store today, so the data is there to be read.

The second effect: a relation touching a volatile entity is itself routed volatile (`routeRelation` →
volatile if either side is), so a link from a persisted entity to a volatile one is on disk but not
loaded at boot. That is deliberate, not a gap, and `sharded-router.ts:173-188` gives the reasoning — a
run record's link to the node it ran belongs to the run, so deleting the node must not erase it. Keep
the routing as it is, and cite that comment in the schema description so the next reader does not take
it for an oversight. Making such a link primary instead would leave a dangling relation after a boot
that does not hydrate volatile: nothing in `@abuddy/ears` validates relation endpoints, and nothing
would ever remove it, because the entity it points at never returns to trigger a removal.

**6. `features.<id>.designation` stays a string, and stops being required to equal the feature id.**
**Already done** — landed outside the phases, since it is three lines and was blocking work now; the
rest of this decision is the record of why. A
designation is a **role** — `settings`, `logs`, `brain`, the thing `getDesignated(role)` looks up — and
a role is not a feature's name. At the survey commit `validate.ts:55-57` rejected any designation
differing from the id, so all five of default-setup's are the id repeated, which is what made the key
look redundant.
An earlier draft of this decision therefore replaced it with `"designated": true`. That was wrong: it
deleted the ability to name a role, not a redundancy.

**Nothing but that one check enforces the equality.** `designationsOf`
(`abuddy-host`'s `packs/registry.ts`) already maps `[f.designation, systemId(f.id)]` — role and system id as
two separate values — and codegen already carries them apart, building a `Map([[featureId,
designation]])` (`generate-entries.ts:630`) and emitting `designation: '<value>'` onto the system and
plugin definitions (`:642`, `:729`). The machinery has always supported a role that differs from the
feature that plays it; only the validator did not. Delete the check.

Role uniqueness is unaffected and still enforced where it matters: `registerPack` throws when another
pack already holds a role (`abuddy-host`'s `packs/registry.ts`). The equality check was also the only thing
stopping **two features of one pack** claiming one role — ids are unique, so equal-to-id designations
were unique too — and `designationsOf` builds an object from entries, so a duplicate would silently
take the last one. So the removal shipped with its replacement: `validateFeatures` now reports
`designation "<role>" is already claimed by feature "<id>"` (the frontend store already warned and
ignored, `fe/pack-store.ts:72-73`).

**One thing to know before touching this again.** `docs/archive/goals/goal-cleanup-and-docs.md:90` is
why the check existed: at that time "the designation registry maps role → role … so a designation only
routes correctly when it equals the feature id". That is no longer true — `createDesignationStore`
(`packs/extensions.ts:26-39`) holds a real `Map<role, id>` and both registries populate it with the
system or plugin id — so the check was guarding an invariant the code had already outgrown. Read the
archived note as history, not as a reason to put it back.

**7. A feature lists what it provides in one line, and paths inside it are relative to
`src/features/<id>/`.**

```jsonc
{ "id": "library",
  "about": "Documents and collections, with a dormant semantic search index.",
  "provides": ["system", "plugin", "settings", "references"],
  "entities": { ... }, "services": { ... }, "repositories": { ... } }
```

`provides` is the complete list of what the feature contributes that lives in a file: `system`,
`plugin`, `settings`, `references`, `types`. Each name resolves to the conventional path
(`be/system.ts`, `fe/plugin.ts`, `settings.ts`, `fe/references`, `be/types`), and the paths a feature
does spell out are relative to its own directory, not the pack root.

**Why a list and not a key per thing.** The first draft of this decision wrote `"system": true` and a
key per capability. Measured against default-setup that is **37 lines whose entire content is the word
`true`** — because all 41 paths its features declare today are already the conventional one (every
`system`, `plugin` and `settings`, both `references` and the one `typesEntry`, at `4f24d04f7`). A
boolean there is a *marker*, not a value: it says the feature has a system without saying anything
about it, and five of them in a row read as a checklist rather than a description. One line that names
them is the same fact with the noise removed, and it reads as a sentence.

**Why not derive it from the directory instead.** Dropping the declaration entirely — `be/system.ts`
exists, therefore the feature has a system — was the other candidate and is what Next.js and Rails do.
Three things rule it out here. The argument eats itself: if a file's presence declares a capability,
then `src/features/library/` declares a feature, and there is no principled reason to keep the
`features` array hand-written while deriving its contents. It removes the off switch, so a scratch
`be/system.ts` becomes a registered system with no way to say otherwise. And it gives up the property
this manifest is for — half of default-setup's features would shrink to an id and a sentence, and the
file would no longer answer "what does this feature contribute" at all, which is the question it
exists to answer.

`provides` does duplicate what the directory shows, and so can drift. `validate` closes that: every
name in `provides` resolves to a file, and a conventional file present but unlisted is a `doctor`
warning. That is the same bargain `package.json`'s `files` and `exports` make, and it is the reason
`exports` is worth writing out.

**The convention is a declared table, not folklore — and today it is folklore.** Because every path is
spelled out in the manifest right now, the layout exists nowhere as a definition: three hardcoded
strings in `abuddy add feature`'s scaffold (`add/feature.ts:203-205`, which does not even scaffold
`references` or `types`) and prose examples in `cli.md:57`, `features.md` and `manifest.md`. A
`provides` list resolved against an undocumented layout would be exactly the magic this goal is
supposed to remove. So the table ships with it:

```ts
// @abuddy/sdk/build — the one definition of what a feature may provide and where it lives
export const FEATURE_LAYOUT = {
  system:     'be/system.ts',
  plugin:     'fe/plugin.ts',
  settings:   'settings.ts',
  references: 'fe/references',
  types:      'be/types',
} as const;
```

Four things follow from its being one object, and each is what keeps the convention findable:

- **`provides`' vocabulary is `Object.keys(FEATURE_LAYOUT)`**, so the Zod enum and the resolver cannot
  drift, and a name that is not a capability cannot be listed.
- **Every consumer derives from it** — `validateFeatures`, the import paths `generate-entries` writes,
  `doctor`, and `abuddy add feature`'s scaffold, which today keeps its own copy of three of the five.
- **Errors name the resolved path**: `Feature "notes": provides "system", but
  src/features/notes/be/system.ts is missing`, and the inverse in `doctor` for a conventional file that
  is present and unlisted. A convention whose failure message names the path it looked for is
  discoverable; one that fails vaguely is the magic.
- **The docs are checked against it, not written beside it.** `features.md` and `manifest.md` carry the
  table, and a spec fails when the prose and `FEATURE_LAYOUT` disagree.

What stays true even so: a convention is knowledge an author has to acquire once. The point of the four
above is that they acquire it from an error message, a scaffold or a hover in their editor rather than
by reading the source of the build.

**One name in the list does less than it looks for an external pack.** `references` generates the
pack's own `src/__generated__/references.ts`, but `PackFERegistration`
(`fe/pack-fe-registration.ts:10-20`) has no `references` member, so nothing an external pack declares
reaches the app's reference system — `docs/public-facing/extensions.md:575` already says it is read
only for built-in packs. Under `provides` that becomes a listed capability whose file exists, so
`validate` passes and nothing happens. Don't gate it in the schema the way `earlySystem` is gated: a
pack's own frontend can import its generated file, so the declaration is not inert, only narrower than
it reads. Make it a `doctor` warning naming the limit, and fix `extensions.md`'s sentence to say that
the types reach the declaring pack's own frontend and no further. If it turns out nothing can use them
at all, gating it is then a one-line follow-up with the evidence already gathered.

Paths outside a feature (content data, extension registers, migrations) stay relative to the pack root.

**8. A capability key appears only when there is more to say than "it exists".** `provides` says the
feature has a system; a sibling `system` or `plugin` key annotates it, carrying the `events` that
`system.entry`'s wrapper object carries today, the plugin's `default` claim, and an `entry` when the
file is not at the conventional path.

```jsonc
{ "id": "threads", "about": "…",
  "provides": ["system", "plugin"],
  "plugin": { "default": true } }

{ "id": "weird", "about": "…",
  "provides": ["system"],
  "system": { "entry": "src/backend/main.ts" } }
```

> **Updated 2026-09-22.** This decision named two more annotations when it was written, and neither
> survives. `outgoingEventsType` no longer exists in `manifest-schema.ts` — it was removed after this
> doc was written, and no pack in the repo carries one. `sendsTo` is deleted by
> [`goal-plugin-inbox.md`](../archive/goals/goal-plugin-inbox.md) (its Decision 2), which has **landed**:
> a plugin declares the events it accepts, so the inverse index `sendsTo` supplied is gone from every
> manifest, from `SystemSchema` and from `abuddy.schema.json`. Nothing here has to remove it.

This is a list with annotations, not two homes for one fact: `validate` requires every capability key
to be named in `provides`, so a `system` block on a feature that does not provide one is an error
rather than a second way of declaring it.

**One reader breaks silently here, the same way two do in Decision 3.** `init-tests.ts:46` picks the
feature to scaffold a test for with `(manifest.features ?? []).find((f: any) => f.plugin)` — an
`any`-typed predicate, so after this change it compiles, finds nothing, and `abuddy init-tests`
scaffolds against no plugin. It becomes `f.provides?.includes('plugin')`. Together with
`ProvenanceManifest` and `features/packs/be/system.ts`, that is **every loosely-typed manifest read in the repo**:
`abuddy-cli/src/utils.ts:34` returns a real `PackManifest`, and `@abuddy/testing`'s
`harness.ts:228` casts to one, so both fail to compile like everything else. Three, and the compiler
names none of them. Measured again on 2026-09-22, the annotations are rarer still — of default-setup's
24 `system` and `plugin` declarations, **three carry anything beyond the entry**: `threads.plugin`
(`default: true`), `actions.system` (`sendsTo: ["flows"]`) and `settings.system`
(`sendsTo: ["host/application"]`) — and **none** overrode the path. Re-measured on 2026-09-23, after
[`goal-plugin-inbox.md`](../archive/goals/goal-plugin-inbox.md) deleted `sendsTo`,
**`threads.plugin.default` is the only annotation left in the pack**; `events` and the `entry` override
exist for external packs rather than for anything here. The `entry` override exists for an external pack with a different layout, not because
anything here needs it.

**9. Every extension point moves under `extensions`**: `steps`, `artifacts`, `blocks`, `commands`,
`dsl`, `fe` (tiptap plugins, app extensions) and `packServices`, which becomes `extensions.services`.
This is VS Code's `contributes`. **`bundleUi` is not one of them** and goes to `build` (Decision 17):
`extensions` is what the pack gives the app, and a packaging choice gives it nothing.

> **Landed** in `a6aad1e4a`, with Decision 17's `build.bundleUi` half. A contribution key found at the
> root is refused with the name it moved to (`_MOVED_ROOT_KEYS`, `manifest-schema.ts`), which is derived
> from the section's own shape, so a key added to `extensions` is named without an edit.
>
> **It left one question open, which this decision does not answer**: `settingsSections` and `help` are
> contributions too — a pack's own settings sections, and its entries in the Settings view's Help list —
> and neither is in the seven this names, nor in the root-key list under *Finished when*. They are still
> at the root. Decide where they go before Phase 6 rewrites the schema's documentation around them.

`packServices` was the pack-level counterpart of `features.<id>.services` — the same `path#export` map for
a service that belongs to no feature. Renaming it drops the `pack` prefix that only existed to keep it
apart from the feature key; nesting it under `extensions` does that by position. It then mirrors
entities exactly: a feature-level home, and a pack-level one for what no feature owns.

**10. Every content concern lives under `content`**: `sources`, `artifacts`, `formats` and `writers`.

> **The section is there; what is open is `boot`.** `content` already holds all four keys, and `boot`
> holds `hooks` alone — so there is no `boot.content` left to move and `boot` is one key away from being
> `lifecycle`.
>
> **`content.datasets` arrived after this decision was written**: compiled datasets the pack reads
> back itself rather than writing to the database. It belongs here by the decision's own test and is
> listed above, but nothing in the reasoning below was written with it in mind.
>
> **`content.sourcesPolicy` no longer exists** (removed 2026-10-08,
> [`goal-boot-content-imports-entities.md`](../archive/goals/goal-boot-content-imports-entities.md)): every key a pack
> declares is imported, and the applier itself leaves a row the user trashed alone. So there is no `policy`
> to move, here or in Phase 3.

The section is named `sources` rather than `data` for two reasons. It is what the entries are: every value is
a path or a `{ path, format, applier }` over source files a compiler reads, and both the current schema
description ("Content data sources") and `resolve.ts`'s `sourcePath` already use the word. And it keeps
`data` meaning one thing in the file: the root `data` is the pack's data model — the types it declares
— while these are the records it ships. Two keys a screen apart, both spelled `data` and meaning
different halves of the same subject, is the kind of thing a reader resolves wrongly once and then
stops trusting the manifest over.

Renaming the root instead was the other option, and every candidate is worse: `schema` sits directly
below `$schema`, the JSON Schema pointer and the file's first key; `model` reads as an inference model
in an app whose ids are `provider:model`; `ears` matches `PackEARS` in the registration but means
nothing to a pack author who has not read the architecture docs. `data` is the right word for a data
model, so the other key gives way.

**`boot` flattens to `lifecycle`, a single path, and `migrations` stays its own root key.**

```jsonc
"lifecycle": "src/features/hooks.ts",
"migrations": "src/migrations/index.ts"
```

`boot` held three unrelated things — `hooks`, `content` and `contentPolicy` — and the content pair has
since left for `content`, so it holds `hooks` alone. What remains is one module path, so it becomes one
key with a path as its value, named for what it is rather than when it runs.

An earlier draft grouped `lifecycle: { hooks, migrations }`. That fails the section test: two keys is
not a search, and neither changes when the other does — a pack adds a migration per release and touches
its hooks almost never. Both are a single module path, and a key whose value is a path needs no
container. `content` remains a section because it genuinely is one: sources, artifacts, formats and
writers are keys that change together whenever a written format changes.

**11. The schema is the specification and the docs follow it.** `manifest-schema.ts` gains a
`.describe()` on every field, `npm run schema:update` regenerates `abuddy.schema.json`, and
`docs/public-facing/manifest.md` is rewritten from the new shape rather than edited.

**12. `defaultPlugin` moves onto the plugin it names.** — **Landed** in `b8d66af4e`, ahead of this goal
and on its own. The root key is gone, `PluginSchema` takes `default`, the schema rejects two features of
one pack claiming it, and codegen reads the claim instead of resolving a feature id. Nothing else in this
redesign was touched, so Decision 8's sibling annotations still have to accommodate it rather than
introduce it. It is loose content at the root today, and it
names a feature's plugin, so it belongs there: `"plugin": { "default": true }`, one of the sibling
annotations of Decision 8 — the feature still lists `plugin` in `provides`, and the annotation says
which of the app's plugins opens first. The host already resolves it first-wins
across packs and warns on the second (`fe/pack-store.ts:63-66`), so nothing about the competition
changes; `validate` additionally rejects two features of one pack claiming it.

**13. Every feature carries an `about` line.** The manifest is the one place that says what a pack
contributes, and today it cannot say what any feature is *for* — only where its files are. A one-line
`about` is the highest-value thing the manifest can gain, and the only part of this goal that adds
content rather than moving it. `abuddy add feature` prompts for it and `validate` requires it.

**14. `$manifestVersion` is deleted, and the pack's existing format stamp is what covers its shape.**

> **Scope: the deletion only.** `PACK_LAYOUT_VERSION` and `PACK_SNAPSHOT_FORMAT` are not to be renamed
> or bumped — the owner's decision — so nothing below that asks for a rename or a new number applies.
> What this decision asks for is that `abuddy.json` carries no version of its own, and the reasoning for
> *why a manifest gets none* is the half to read.

The schema declares `$manifestVersion` (`manifest-schema.ts:211`, `z.literal(1).optional()`, "Enables
future format evolution"), **no code reads it, and no manifest in the repo sets it** — its only
appearance anywhere is its own declaration. Meanwhile three format stamps already exist and are
enforced:

| stamp | written to | covers | checked by |
|---|---|---|---|
| `PACK_LAYOUT_VERSION = 1` (`packs/layout.ts`) | `integrity.json`'s `formatVersion` | an installed pack's files and where they sit | `verifyPack` throws "Update AgentBuddy or rebuild the pack"; `loader.ts:171` skips the pack with a warning |
| `LMDB_FORMAT_VERSION = 1` (`lmdb/envs.ts:20`) | the database's meta | the storage format | `openEnvAt`, which refuses to open |
| *(none)* — the build stamp (`build/packages-built.ts`) carries **no** version | `node_modules/.cache` | tooling freshness | its fingerprint, recomputed on every read. It had a `STAMP_VERSION` until 2026-10-02; a stamp nothing but this checkout reads needs no format field, because the comparison recomputes its own side |

`$manifestVersion` is not a fourth kind of thing. `abuddy.json` is a file *in* the layout: both stamps
would be written at build time, read by the same host code at install and load, and mean the same thing
to a user — this pack was built for a different AgentBuddy. Two stamps for one event is worse than one,
because they can disagree. A restructuring like this one would, once packs exist in the wild, have to
move both: the manifest's keys changed, and a pack built before it cannot be loaded. Move one and not
the other and a pack reads "layout 1, manifest 2" — the files are where I expect and I cannot read one
of them. Nobody has a use for that state, and nobody wants to remember to move two numbers together.

**Why a manifest gets no version of its own, and why the artifact still gets one.** A format version
earns its place where the artifact outlives its reader and cannot be rebuilt: Kubernetes objects carry
`apiVersion` because the YAML sits in git and is served by many API-server versions, Chrome extensions
carry `manifest_version` because they sit in a store on machines that will never rebuild them, OCI
image manifests carry `schemaVersion` for the same reason. Where a toolchain the author runs rebuilds
the artifact, there is none: `package.json`, `Cargo.toml` and `pyproject.toml` have no format version
between them. Docker Compose is the direct precedent for deleting one — its top-level `version:` key
was deprecated and is now reported as obsolete.

`package.json` gets away with it for a reason worth naming, because it is not "a stamp is never
needed": **npm has never made a breaking change to it.** Fifteen years of purely additive evolution,
new fields that old readers ignore. That is a discipline, and it is one this goal is explicitly not
following. A pack, meanwhile, is a built artifact — `abuddy build` produces it and `stagePack` writes
the built `abuddy.json` into the archive beside `integrity.json` — so it is in `package.json`'s
category, and the manifest needs no version inside it.

**`hostVersion` cannot take over the job, which is why the artifact keeps one stamp.** It is already
the `engines.vscode` answer, checked at install (`packs/installer.ts`), at load (`loader.ts:159`)
and by update checks. But it is author-declared and open at the top: `abuddy init` scaffolds
`">=0.3.0"`, and a 0.4.0 host satisfies that. `hostVersion` says "the oldest host I work with", never
"the newest", so a pack built against the old manifest shape would claim compatibility with a host
that cannot read it. Expressing a format break needs something the host controls and the author
cannot overstate, which is what `formatVersion` in `integrity.json` is.

So the answer to "how does a host know a pack's format" is: from `integrity.json`, which it reads
before the manifest, for the one case where the two can disagree. And after the first release with
users, the goal is to need it as rarely as npm does — additive changes only, a key never renamed — at
which point the stamp is vestigial and is exactly what lets you break once if you truly must.

The placement settles it. `$manifestVersion` sits **inside the file it versions**, so reading it means
already parsing the file whose parseability is in question. `integrity.json`'s `formatVersion` sits
**outside** the files it covers, beside the `id`, `version`, `hostVersion` and `sdkVersion` it already
records, and the host reads it before it reads anything else. That is the shape a compatibility stamp
has to have.

So: delete `$manifestVersion`, and treat an incompatible change to the manifest's structure as what it
is — a new pack format, covered by `PACK_LAYOUT_VERSION`, which already sits outside the files it
describes. Its name is not to change (see the scope note above); what the implementation owes is a doc
comment on it saying it covers the layout *and* the manifest's structure.

**Drop `Math.floor` from both checks.** `verifyPack` (`packs/layout.ts`) and
the loader (`loader.ts:171`) compare `Math.floor(integrity.formatVersion)`, which treats the stamp as
`major.minor` with a compatible minor. Nothing writes a fractional version — `stagePack` writes the
constant — so it is machinery for an evolution that has not happened, and it silently accepts a `1.5`
that no code could have produced. A plain `!==` says what the check means. Keeping the floor would be
the same speculative move as `$manifestVersion`, in a smaller package.

**It stays at `1`.** Nothing has shipped — the newest tag is v0.3.14, which predates the pack machinery
— so there is no pack anywhere built against the old shape for a bump to protect. Every pack in the
repo is rebuilt by these phases. A stamp is for skew between a pack and a host that were built apart;
bumping it here would only mean rebuilding packs that this goal rebuilds anyway. The first bump belongs
to the first structural change made after a release exists.

> **The subject of this decision's second half no longer exists.** `goal-one-kind-of-pack` deleted
> `publishHostPackOutput` and `host-packs/` with it: a pack the app ships is *installed*, in the one
> full pack layout, `integrity.json` included. So the asymmetry below — a partial layout with a
> `.fingerprint` and no `integrity.json` — is gone rather than undocumented, and the Phase 6 that was
> to document it has nothing to document. What survives is the decision itself: the stamp stays at `1`.
> The freshness question `.fingerprint` answered is now `packFileHashes` against `stagedFileHashes`,
> compared at boot (`packs/installer.ts`).

**The gap, why it does not bite, and why it needs writing down.** A published built-in pack
(`host-packs/<id>/`) is a *partial* pack layout: `publishHostPackOutput` writes `types/snapshot.json`,
`build/`, `runtime/index.cjs` with `runtime/content/`, and a `.fingerprint` — **no `abuddy.json` and no
`integrity.json`** (its manifest is read from inside `snapshot.json`). An unbuilt source pack has
neither either. So neither carries the stamp, and skew is impossible for both: a built-in pack ships
inside the host that reads it, and an unbuilt source pack is built by a CLI its author chose. The one
case where a pack and a host can disagree is an installed external pack — exactly the case that always
has `integrity.json`. The two files are doing different jobs, which is the whole explanation:
`.fingerprint` answers "is this copy current" for output the host itself just produced, and
`integrity.json` answers "is this complete and untampered, and can I read its format" for a directory
that arrived from elsewhere.

**None of that is written down anywhere**, and the asymmetry reads as an oversight to anyone who finds
it: `packs/layout.ts`'s header documents "the one layout an external pack has everywhere" and lists
`integrity.json` in it, `publishHostPackOutput`'s doc comment says what it copies but not what it
deliberately omits, and `packs/runtime/CLAUDE.md`'s install-locations table enumerates `packs/<id>/`'s
contents while leaving `host-packs/<id>/` as "build output". Phase 6 fixes all three. This one is not
caused by the goal — it is true at `4f24d04f7` — but Decision 14 now rests on it, and a decision
resting on an undocumented invariant is one bad refactor from being wrong.

**15. This is the last cheap rename, and the discipline starts at the first release with users.**

Of the 28 root keys the schema allowed at the survey, this goal renames, moves or deletes 14
(`artifacts`, `blocks`, `boot`, `commands`, `defaultPlugin`, `dsl`, `entities`, `entityShapes`, `fe`,
`packServices`, `partitionPolicy`, `relKinds`, `steps`, `$manifestVersion`); `features` keeps its name
and is rewritten inside; and 11 are untouched
(`$schema`, `id`, `name`, `version`, `description`, `license`, `builtIn`, `hostVersion`,
`dependencies`, `permissions`, `migrations`).

**Nine of the fourteen have been spent**, which is what makes the rule below the live question rather
than a forecast: `artifacts`, `blocks`, `commands`, `dsl`, `fe`, `packServices` and `steps` moved under
`extensions`, `defaultPlugin` moved onto its plugin, and `partitionPolicy` was deleted outright. The
schema allows **22** root keys now. What is left to spend is `boot`, `entities`, `entityShapes`,
`relKinds` and `$manifestVersion` — five, and worth doing together, since every pack in the world has
to be rebuilt either way and there are none.

Two of those are pure naming and nothing else: `boot.hooks` → `lifecycle` and `typesEntry` → `types`.
In an additive-only world neither would ever happen, because a cosmetic rename is not worth asking
every pack author to rebuild. They are worth doing here only because the break is already being paid
for.

That is the rule this goal is spending, and it should be spent deliberately rather than discovered
later: **anything cosmetic that is not fixed now will not be worth fixing afterwards.** A final read
of the key names before Phase 6 lands is part of the work, not a nicety.

After the first release that has users, the manifest follows `package.json`'s discipline, and the
schema's own doc comment says so:

- **Additive is free.** A new optional key, a new value accepted by an existing key, a new entry in a
  map. Old packs keep working; old hosts ignore what they do not know.
- **A rename, a removal, a required field or a changed value type is a format break**, and costs a
  format bump and a rebuild of every pack in the wild. The bar for one is a problem that cannot be
  solved additively, not a name someone would spell differently.
- **Deprecate by leaving it alone.** A key that stops mattering stops being written by
  `abuddy add` and stops being documented; it does not need removing, and removing it is the
  expensive half.

**16. No compatibility of any kind.** No dual-read, no alias, no deprecation warning. Every manifest in
the repo — default-setup, all three fixtures, the `abuddy init` scaffold and the packaged-authoring
script's generated pack (the Background's table) — changes in the same phase as the schema section it
depends on.

Note what this rule does **not** cover: a change that only *loosens* a rule breaks no manifest, and
old files continuing to validate is not compatibility — there is no second reader, no alias and no
translation, only a larger set of valid manifests. Decision 6 is the example. What the rule forbids is
a renamed or removed key that keeps working through code written to accept it.

**17. Two sections for what the app never loads: `build` and `checks`, and no sidecar files.**
`build` holds settings that change what `abuddy build` produces or how long it takes; `checks` holds the
pack rules the pack switches off. `abuddy.checks.json` is **deleted** and its contents become
`checks: { allow: [...] }`, keeping that shape and vocabulary so the move is mechanical and its error
messages stay true.

**The criterion is not "the app never reads it", and getting that wrong is the trap.** Measured
2026-10-08: of the manifest's 29 top-level keys the app reads ten — `builtIn`, `dependencies`,
`description`, `entities`, `features`, `hostVersion`, `id`, `name`, `permissions`, `relKinds`, `version` —
and never reads the other nineteen, `steps`, `artifacts`, `blocks`, `commands`, `dsl`, `help`,
`settingsSections`, `content.formats`, `content.writers`, `entityShapes` and `migrations` among them. Those are
contributions that reach the app through *generated code*, so a test of who parses the manifest key would
sweep nearly the whole file into `build`. The test is instead: **does this key reach the running app by
any route, generated code included, or does it only tune the build?**

By that test `build` has exactly two residents and will stay small:

| key | why |
|---|---|
| `opaqueDeps` | dependencies the frontend bundle includes whole instead of walking. Landed 2026-10-08 |
| `bundleUi` | out of `fe`. A packaging choice: it declares no contribution, it decides which copy of `@abuddy/ui` the bundle carries. The borderline case, since that choice has a runtime consequence — but nothing reads it as a declaration. **Landed** in `a6aad1e4a` |

> **Half landed**: `build` holds both residents. `checks` is open, and `abuddy.checks.json` is still a
> sidecar — `abuddy-cli/src/build/pack-rules.ts` reads it and `docs/public-facing/cli.md` documents it.

**The measurement above was taken before Decision 9**, so its key counts describe a flat root: the
nineteen it says the app never reads are now mostly inside `extensions`, which is the same set under one
key. The test it states is unchanged, and it is the reason `extensions` and `build` are two sections
rather than one.

`checks` is its own section rather than `build.checks`, because `abuddy validate` runs the rules without
building anything, so "build" is the wrong word for authoring policy, and `build.checks.allow` is three
levels deep for one list.

**Why these belong in `abuddy.json` at all**, against `goal-one-rule-set`'s reasoning for the sidecar — it
put the rules in a file of their own as *"read at build time and never by the app, so `abuddy.json` stays
what the app loads"*, with *"`ManifestSchema` is untouched"* beside it. The first was already false when it
was written, by the measurement above. The second is the cost of that change, not a principle. What a
sidecar costs is paid in validation: `abuddy.build.json` was built on 2026-10-08 and deleted the same day,
because a bare JSON file has no schema, so it needed a 60-line hand-written reader and a seven-case spec
for parse errors, unknown keys and wrong types. In the manifest, `.strict()` Zod does all of that — a
typo'd `opaqueDeeps` fails `abuddy validate` with *"abuddy.json \"build\": Unrecognized key(s) in object"*,
a better message than the hand-rolled one — and pack authors get completion from `$schema`. Folding in
deletes code; splitting out writes it.


## Open decisions

Settle these with the owner before Phase 1. Both are cosmetic renames, which is exactly why they have
to be decided now rather than later: after this goal a rename costs a format bump (Decision 15), so a
name not fixed here is a name kept for good.

1. **`extensions.fe` → `extensions.frontend`?** `fe` is the repo's internal shorthand and it is
   everywhere in the source, but `abuddy.json` is the pack author's surface and an unexplained
   two-letter abbreviation is the one kind of name a newcomer cannot guess. Against: `fe`/`be` is
   consistent with the directory layout an author already sees (`src/features/<id>/fe/`), so the
   abbreviation is one they meet on their first day either way.
2. **`hostVersion` → `engines: { abuddy: ">=0.3.0" }`?** For: it is exactly npm's and VS Code's
   spelling for this field (`engines.node`, `engines.vscode`), so it is recognised on sight, and
   Decision 14 already cites that precedent as the one AgentBuddy follows. Against: `engines` is a map
   because npm packages have several; a pack has one host, so the map is a wrapper around a single
   key, and `hostVersion` says the same thing in one line with no nesting.

Everything else in Decisions is final.

## Phases

Each phase changes one section of the schema, every manifest that uses it, and every consumer that reads
it, then leaves the full chain green. They are ordered so the largest mechanical wins land first.

### Phase 1 — the data model a pack declares

- Merge `entities` and `entityShapes` into one `entities` map, on the feature that owns each entity,
  with `data.entities` for an entity no feature owns (Decision 3), and `relKinds` into `data.relations`
  (Decision 4). Add `packEntities(manifest)` and route every reader through it.
- **Decide Decision 5 again before implementing it** — its note says why. If it stands, `volatile` on
  the entity means widening the entity value to `string | null | { shape, volatile }` and *building* the
  route from the manifest to the partition policy, which no longer exists: `appPartitionPolicy()` is a
  constant and nothing contributes to it. There is no loader strip left to delete.
- Update `manifest-schema.ts`, `generate-entries.ts` (entity names, shapes, relation constants),
  `abuddy-host/src/database/schema.ts` (`readInstalledSchema`), `packs/runtime/loader.ts`,
  `features/packs/be/system.ts` (both `PackInfo` builders, and give its `readManifest` a real return
  type in place of `Record<string, any>`), `abuddy-sdk/src/build/manifest.ts` (`ProvenanceManifest`'s
  own `entities` field, which does not fail to compile on its own),
  `abuddy-cli/src/commands/build.ts` (the snapshot, whose `PackTypeManifest` stays flat),
  `abuddy-cli/src/commands/add/manifest.ts` and `init.ts`'s scaffold.
- Delete `$manifestVersion`; widen the format stamp's doc
  comment to the manifest's structure. It stays at `1` (Decision 14).
- Update default-setup and every other manifest in the Background's table: all three fixtures
  (`external-pack`, `bundled-ui-pack`, `dependent-pack`), the `abuddy init` scaffold, the pack
  `tests/scripts/test-packaged-authoring-author.sh` writes, and the two in-process fixtures Background
  names (`packFixture`'s `DEFAULT_MANIFEST` and `generate-entries`' spec-support `manifest()`).

**Done when:** `npm run schema:update` is clean and `abuddy.schema.json` is committed; `abuddy build`
for default-setup produces a `src/__generated__/ears.ts` byte-identical to the one before the change
(diff it, and record that in the phase's commit); `partitionPolicy` appears in no manifest and in no schema, and
`loader.ts` no longer mentions it; every reader of a manifest's entities calls `packEntities` and a
spec fails when one open-codes the merge; `$manifestVersion` appears in no schema and no manifest, and
the pack's existing format stamp is the only one, still `1`; `packages/abuddy-host/tests/database/partition-policy.spec.ts` passes,
with a case added for an external pack marking its own entity volatile and that entity routing to
`volatileBackup`; the schema's description of `volatile` says persisted-but-not-hydrated and not
backed up, and the phrase "in-memory only" appears nowhere; `npm run typecheck`, `npm run test:unit`,
`npm run test:external-pack` pass.
Mutations: an entity listed with a shape reference whose export does not exist fails the build, naming
the entity; removing `TNode` from `SDK_EXCLUDED_ENTITY_TYPES` fails `database/partition-policy.spec.ts`; a pack
declaring an entity another pack owns still fails registration with the EARS collision message, which
is what keeps `volatile` scoped to its declarer; the same entity declared on a feature and in
`data.entities` fails `validate` naming both; a pack whose entities are all on features reports the
right `entityCount` in the Packs view, and reverting `features/packs/be/system.ts` to read the pack-level map alone
makes it report `0`; reverting `ProvenanceManifest` to its own `entities` field leaves the build green
and empties the snapshot's entity provenance, which a spec over a two-pack fixture must catch, since
the compiler will not.

### Phase 2 — `extensions`: everything a pack contributes — **landed** (`a6aad1e4a`)

All seven keys moved, `packServices` became `extensions.services`, and `bundleUi` went to `build`
(Decision 17's half). The mutation this phase asked for is `manifest-schema.spec.ts`'s *"names where a
contribution key went when it is found at the root"*, over `_MOVED_ROOT_KEYS`.

**What it did beyond the relocation**, and what a later phase should not expect to find: `steps`,
`blocks` and `artifacts` are keyed maps of individual declarations rather than barrel paths, so a step's
`path` and its `register`/`build`/`definitions` trio are gone (`27664c122`). Phase 4's reasoning about
paths inside a feature holds, but the step directory is now derived from a facet's own path rather than
declared.

**What it left open**: `settingsSections` and `help` are contributions and are still at the root — see
Decision 9's note.

### Phase 3 — `boot` becomes `lifecycle`

**The `content` section is already there**, holding `sources`, `artifacts`, `formats` and `writers`, so
what is left of Decision 10 is the key `boot` has been reduced to.

- Flatten `boot: { hooks: "<path>" }` to `lifecycle: "<path>"`; `migrations` stays a root key.
- Three sites read it, all in `generate-entries.ts`: the hooks import, the registration's `boot` member,
  and the manifest field itself. `PackRegistration.boot` is the registration's own name for the pair of
  hooks and is not a manifest key — leave it alone.
- Update default-setup's and `external-pack`'s manifests and the `abuddy init` scaffold; the other two fixtures declare no `boot`.

**Done when:** no manifest has a `boot` key, `lifecycle` is a string in every manifest that has one,
and `migrations` is still a root key; no pack re-applies on the next boot — `contentRevision`
(`packs/runtime/apply.ts:28`) and the boot apply's hash cover the compiled `.json` output and never the
manifest, so byte-identical compiled content mean an unchanged hash, which is the same fact the next
clause checks from the other side; the compiled content for default-setup are
byte-identical (`dist/*.content.json`, `dist/content.json`); `tests/content` passes;
`npm run compile`, `npm run test:unit`, `npm run test:external-pack` pass.

### Phase 4 — features: what they contribute, and where

- Nothing to do for designations: Decision 6 already landed (`validate.ts`, its spec, the CLI spec,
  and the three docs that stated the old rule). Keep a feature's `designation` as the string it is.
- Add `FEATURE_LAYOUT` to `@abuddy/sdk/build` as the one definition of the feature layout, derive
  `provides`' schema enum from its keys, and route `validateFeatures`, `generate-entries`' import
  paths, `doctor` and `abuddy add feature`'s scaffold through it — `add/feature.ts:203-205` keeps its
  own copy of three of the five today (Decision 7).
- Replace the per-capability keys with one `provides` list, each name resolving through
  `FEATURE_LAYOUT`, and make every path a feature does spell out relative to `src/features/<id>/`
  (Decision 7).
- Keep `system`/`plugin` as optional sibling annotations carrying `events`, the plugin's `default`
  claim, its `contract` and an `entry` override, and make `validate` reject one whose name is absent
  from `provides` (Decision 8). `sendsTo` is not among them:
  [`goal-plugin-inbox.md`](../archive/goals/goal-plugin-inbox.md) already deleted it.
- ~~Move `defaultPlugin` onto the feature's plugin as `{ "default": true }` (Decision 12).~~ **Done ahead of this goal**, on its own: the root field is gone, `PluginSchema` takes `default`, `validate` rejects two features of one pack claiming it, and codegen reads the claim. Nothing else in the redesign was touched.
- Widen `validateFeatures` (`validate.ts:47`, moved by Decision 6) to check **every** name in
  `provides`, not the three
  paths it checks today (`settings`, `system.entry`, `plugin.entry`). A listed `references` or `types`
  whose file is missing must fail here, not much later. Resolve each name to its conventional path, or
  to the feature-relative `entry` when one is given, and reject a path that escapes the feature's
  directory.
- Add `about` to every feature and require it in `validate.ts`; `abuddy add feature` prompts for it
  (Decision 13).
- Rename `features.<id>.typesEntry` to `types`, relative to the feature's directory like every other
  feature path (Decision 7). Phase 1 already put `entities` on the feature; this phase makes its shape
  paths relative with the rest.
- Update `generate-entries.ts`, `validate.ts`, `add/feature.ts`, `init.ts`, `doctor.ts` and the loader.

**Done when:** no manifest contains the string `src/features/` inside a `features` entry; no feature
key anywhere holds the value `true` except `plugin.default` (`earlySystem` is gone — the schema refuses
it as an unknown key); no manifest contains a root `defaultPlugin`; every feature in every manifest has
an `about` and a `provides`; the generated `pack-entry.ts`, `pack-entry-fe.ts`, `ref.ts` and `fe.ts` for
default-setup are byte-identical to before; `npm run
typecheck` and the full unit chain pass. Mutations: a feature naming a path that escapes its directory
(`../other/be/system.ts`) fails validation; a feature listing `"system"` in `provides` whose
`be/system.ts` does not exist fails the build naming the expected path, rather than silently having no
system; a `system` annotation on a feature whose `provides` omits `system` fails `validate`; a feature
without `about` fails `validate`; two features of one pack both claiming `plugin.default` fail
`validate`.

### Phase 5 — one encoding for a module reference

- Apply Decision 2 everywhere the previous phases have not already: one shared Zod refinement for
  `path#export`, used by services, repositories, content writers, compilers, DSL entries and
  `migrations`. The contribution keys already have it — `ExportTargetSchema` is that refinement, and a
  step's and a block's facets go through it — so what is open is `references`, `entityShapes` and the
  two feature entries.
- Bare path means the default export; the refinement rejects an empty export name (`"path#"`). A
  block's and an artifact's `fe` are already that case, a `.vue` component taken by its default export.

**Done when:** `manifest-schema.ts` has exactly one place that parses `#`; no `{ source, type }` object
remains in any manifest or the schema; the full chain passes. Mutation: `"path#"` and `"#export"` both
fail validation with the message naming the expected form.

### Phase 6 — the schema is the documentation

- Every field in `manifest-schema.ts` carries a `.describe()`; regenerate `abuddy.schema.json`. The
  entity value's description says what `null` means — the type exists and has no registered shape, so
  its rows read untyped — since that is the one value in the manifest a reader is most likely to take
  for "not set yet".
- Document the feature layout from `FEATURE_LAYOUT` in `docs/public-facing/features.md` and
  `manifest.md`, and add a spec that fails when the documented table and the constant disagree. The
  layout is a contract as soon as `provides` resolves against it, and `cli.md:57-58`'s prose list is
  where a reader looks for it today.
- Document what a published built-in pack's directory holds and why it is a partial layout
  (Decision 14): the header of `packs/layout.ts` (which today describes the external pack's layout as
  "the one layout ... everywhere"), `publishHostPackOutput`'s doc comment (what it omits, not only what
  it copies) and `packs/runtime/CLAUDE.md`'s install-locations table (enumerate `host-packs/<id>/` as
  it does `packs/<id>/`). Say what each file is for — `.fingerprint` for "is this copy current",
  `integrity.json` for "is this complete, untampered and in a format I read" — so the asymmetry reads
  as a decision rather than a hole.
- Rewrite `docs/public-facing/manifest.md` from the new shape, and update every other doc that names a
  retired key. That surface is larger than it looks: eight public-facing docs (`manifest`,
  `architecture`, `cli`, `getting-started`, `extensions`, `features`, `content`, `services-and-data`) and
  ten `CLAUDE.md` files (root, `abuddy-sdk`, `abuddy-cli`, `abuddy-host`,
  `abuddy-host/src/packs/runtime`, `abuddy-ears`, `default-setup`, `default-setup/src/content`,
  `renderer`, `api`). Sweep by key name — `designation` alone appears in 23 files — rather than by
  memory of which docs discuss manifests. Leave `docs/archive/` alone: archived goals record what was
  true when they were written, and rewriting them destroys that.
- Add a spec asserting the built-in pack's manifest has exactly the fifteen root keys the prompt block
  names, **in that order**, and no map whose keys equal its values, so the shape does not silently
  regrow. Naming them beats counting them: a count passes when one key is swapped for another, and the
  order is half of what makes a flat root readable (Decision 1). This spec, not Decision 1's prose, is
  what stops the root regrowing to 24 keys.
- Make `abuddy add`'s manifest writer emit the canonical order (`writeManifest`,
  `abuddy-cli/src/commands/add/manifest.ts:7`, the one line `add feature`, `add service`,
  `add migration` and `add step` all write through), so no `add` command can produce a file the spec
  then rejects. **Preserving insertion order is not enough and the current code does no more than
  that**: `writeManifest` is a plain `JSON.stringify` of whatever object it is handed, which is
  `JSON.parse` of the file plus whatever the mutators appended. Every `add` mutator creates the key it
  needs when it is absent — `extensions` itself, then `extensions.steps`, `.artifacts`, `.blocks` or
  `.services`, and `feature.services` — so a new key lands at the end wherever it belongs, at **three**
  levels now rather than two. Rebuild each — root keys in the canonical order, `extensions`' in the
  order Decision 9 lists, each feature's in the feature order — and spec all three.

**Done when:** `npm run schema:check` passes; `docs/public-facing/manifest.md` mentions no retired key
(`entityShapes`, `relKinds`, `designation`, `boot`, `$manifestVersion`, and `settingsSections` and
`help` wherever Decision 9's open question puts them); the new spec passes.
Mutations: adding a sixteenth top-level key fails that spec; so does a map whose keys equal its values;
so does writing the keys in a different order.

The retired-key list is shorter than it was: `partitionPolicy`, `content.sourcesPolicy`,
`defaultPlugin` and the moved extension keys are already absent from that doc, and `manifest.md`
documents `extensions` and `build.bundleUi` as they are.

### Phase 7 — `build` and `checks`: what the app never loads

Decision 17. The smallest phase, and last because it is the only one that deletes a file rather than
moving keys within the manifest. **Its first bullet is done**; what is left is `checks`.

- ~~`BuildConfigSchema` gains `bundleUi`, and `FEConfigSchema` loses it.~~ **Landed** in `a6aad1e4a`
  with Phase 2: `fe-bundler.ts`'s `bundlesUi` reads `build.bundleUi`, and
  `tests/packs/bundled-ui-pack/abuddy.json` is the one manifest that sets it.
- A `checks` section — `{ allow: [string] }`, `.strict()` — and `abuddy.checks.json` is deleted with
  `loadPackChecks`' file handling: it reads `manifest.checks?.allow` instead. **Keep its two refusals**,
  which the schema does not cover: a name that is not a rule, and a rule that is not switchable, each
  erroring with the switchable set. Zod rejects a non-string and an unknown key; it does not know what a
  rule name is. `loadPackChecks` then takes the parsed manifest rather than a pack directory, so the
  reader has one input and no filesystem of its own.
- **No pack has a checks file** (measured 2026-10-08: zero on disk), so nothing migrates — the escape
  hatch has never been used, which is also why this costs nothing to move.
- `docs/public-facing/cli.md`'s `abuddy validate` section documents `checks` in the manifest instead of
  the file, and `manifest.md` gains `build` and `checks` beside the other sections.

**Done when:** `abuddy.checks.json` appears in no source, doc, scaffold or fixture, and
`loadPackChecks` touches no filesystem; `tests/packs/bundled-ui-pack` still bundles its own
`@abuddy/ui` and its Playwright suite passes; a pack
allowing a non-switchable rule still fails naming the switchable set; `npm run schema:check` passes with
the regenerated schema committed, `npm run api:update` has been run, and the chain is green.

## Deferred

- **Splitting the manifest into several files** (a `content.json` beside `abuddy.json`, say). One file that
  fits on a screen is the goal; more files is a different trade and not this one.
- **Replacing JSON with a typed authoring format** (a `abuddy.config.ts` the build imports). It would
  remove the `path#export` strings entirely in favour of real imports, and it changes how the CLI, the
  loader and the installed-pack layout all read a manifest. Worth its own goal if authors ask for it.
- **`permissions`**, which only fixtures declare and nothing enforces yet. Leave the key where it is.
- **Deleting the pre-release migrations.** `v0.3.14` is tagged and the app has no users, so the five
  default-setup migrations (`0.3.0`, `0.3.1`, `0.3.13`, `0.3.14`, `0.4.0`) and the host's
  `app/0.4.0.ts` move data shapes that exist only in a developer's own data dir. The runners stay
  regardless, since external packs migrate against their own versions. (`markWrittenEntityUnedited` was the
  other half of this item and is already gone: the merge adopts an entity it wrote but has no recorded
  parts for, which is what that function did to one release's entities by hand.) This is not a manifest
  change and does not belong in this goal: it is a decision about real data in a real data dir, which
  is the owner's to make and to time, and it is only safe if they are willing to reset a dev install
  that still holds a pre-`0.4.0` shape. Worth doing before the first release that has users, when the
  slate is genuinely clean and nothing is lost by it.
- **Giving `SearchIndex` and `IndexedDoc` typed shapes.** They are the only two of default-setup's
  twelve entities with none, so their rows are untyped wherever they are read. The types are written
  already — `SearchIndex` and `IndexedDocEntity` in
  `src/features/library/be/search-index/types/search-index.ts` — but they are plain interfaces: neither
  extends `BaseEntity` or carries the `_type: EARS.Entity.<name>` discriminator a shape needs, and
  `EARS.Entity.SearchIndex` and `EARS.Entity.IndexedDoc` already exist for them to name
  (`src/__generated__/ears.ts:11-14`). So it is a change to that file plus one entity line, small but
  outside a goal whose proof is that the generated types did not move. Do it before or after, not
  during.
- **Splitting "not hydrated" from "not backed up".** Decision 5 keeps `volatile` meaning both, because
  that is what the partition already does. They are separate axes, and an entity that wants one without
  the other has no way to say so: "persisted, loaded at boot, kept out of backups" is a reasonable thing
  for rebuildable-but-expensive data to want, and it is not expressible. The seam is `makePolicy`'s
  `hydratePartitions`, which already takes a set and is always given `['primary']` — so the change is
  `policy.ts`, `hydrate.ts`, `store.ts` and `exportDatabase`, plus the schema and codegen. A persistence
  change rather than a manifest one, and once the axes are separate `volatile` is probably the wrong
  word for either of them.

## Constraints

- Commit each phase as it finishes, in logical chunks, with no attribution lines, using
  `git commit -- <paths>` after checking `git diff --cached`.
- No backward compatibility, in code or in data: no dual-read, no alias, no deprecation path, no
  migration for an installed pack's manifest. Nothing has shipped.
- Every phase leaves `npm run typecheck` and `npm run test:unit` green before the next one starts.
- **Every phase that touches `manifest-schema.ts` ends with `npm run api:update` and commits
  `etc/*.api.md` with the rest of the phase.** `PackManifest` is `z.infer<typeof ManifestSchema>`, a
  published export of `@abuddy/sdk/build`, so the report inlines the whole manifest type —
  `packages/abuddy-sdk/etc/build.api.md` names the keys this goal retires 35 times. `npm run typecheck`
  runs `api:check` and fails on a stale report, so a phase that skips this cannot meet its own
  "Done when". Budget ~46s for the three reports.
- Generated output is the proof for Phases 1–4: compare `src/__generated__/` and `dist/` before and
  after, and treat any diff as a regression unless the phase says otherwise.
- Don't change the typed EARS types to make a call site compile
  (`packages/abuddy-sdk/TYPED-EARS.md`).
- Don't push, tag, open a PR, publish, or touch a real data dir.
