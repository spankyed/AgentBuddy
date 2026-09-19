> **Written in session** `23ab84ee-4c28-4dde-8ea9-641d6aa004cd` (Claude Code, 2026-09-19). Resume it with `claude -r 23ab84ee-4c28-4dde-8ea9-641d6aa004cd`.

```
# Goal: abuddy.json has a shape, not a pile of keys

Implement docs/goals/goal-manifest-redesign.md on a branch cut from master.
Read Background, Decisions, Phases and Constraints first, and
docs/goals/goal-manifest-redesign.example.json, which is the finished shape for the built-in pack.
Decisions are final: implement them, don't reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility anywhere: no dual-read of old and new keys, no deprecation window, no
migration of an installed pack's manifest. Nothing has shipped — the newest tag is v0.3.14 and it
predates the pack machinery entirely. Change the schema, update every manifest in the repo in the same
change, and fix forward.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- packages/default-setup/abuddy.json has exactly these top-level keys, in this order and no others:
  $schema, id, name, version, description, license, builtIn, hostVersion, data, features, extensions,
  seed, lifecycle, migrations. No key holds a map whose keys equal its values.
- Every feature carries an `about` line, and every entity is declared once — on the feature that owns
  it, or in `data.entities` when no feature does — as a shape reference or null.
- No entity gains or loses a typed shape: the generated src/__generated__/ears.ts is byte-identical.
- No manifest in the repo spells a module reference two ways: `path#export` is the only form, and a
  bare path means the module's default export.
- `features[].designation` does not exist in any manifest or in the schema.
- `partitionPolicy` exists in no manifest and no schema; an entity is volatile by carrying
  `"volatile": true` beside the entity's shape, any pack may mark one it declares, and `loader.ts` strips
  nothing.
- Every path inside a feature is relative to that feature's directory, and a feature that follows the
  conventional layout declares no paths at all.
- npm run schema:check passes with the regenerated abuddy.schema.json committed.
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

The manifest works, and it grew one key at a time. It is now 24 top-level keys over 552 lines for the
built-in pack, with four concerns interleaved at the same level, three different ways to name a module,
and two maps that carry no information. This goal gives it a shape a pack author can hold in their head,
without changing what a pack can declare: 14 top-level keys over 485 lines, worked out in full in
`docs/goals/goal-manifest-redesign.example.json`, which is default-setup's manifest rewritten to the
shape the Decisions specify. That file is the target; read it beside them.

## Background (2026-09-19, at 4f24d04f7)

`packages/default-setup/abuddy.json` is 552 lines and 24 top-level keys. The schema is
`packages/abuddy-sdk/src/build/manifest-schema.ts` (299 lines), which generates
`packages/abuddy-sdk/abuddy.schema.json` (`npm run generate:schema`, checked by `npm run schema:check`).

Manifest consumers: `abuddy-sdk/src/build/generate-entries.ts` (most of it),
`abuddy-cli/src/commands/build.ts`, `add/{manifest,step,artifact,block}.ts`, `info.ts`, `doctor.ts`,
`init.ts`, `init-tests.ts`, `build/dsl-defs.ts`, `abuddy-host/src/packs/runtime/loader.ts`,
`abuddy-host/src/database/schema.ts`.

Other manifests in the repo: `tests/fixtures/external-pack/abuddy.json` (89 lines),
`tests/fixtures/bundled-ui-pack/abuddy.json` (24 lines), and the one `abuddy init` scaffolds
(`abuddy-cli/src/commands/init.ts`). Fixtures also use `dependencies` and `permissions`, which
default-setup does not.

### Measured problems

**Two maps carry no information.**

- `entities` is an identity map: all 12 keys equal their values. `abuddy init` scaffolds it that way
  (`init.ts:18`, `entities: { [pascalName]: pascalName }`).
- `relKinds` maps SCREAMING_SNAKE to snake_case (`PARENT_OF: "parent_of"`), which is mechanical. The keys
  are load-bearing — they become `EARS.RelKind.PARENT_OF` in `__generated__/ears.ts:47-67`, used in pack
  code — but codegen can derive the constant from the wire value.

**One concept is declared in two places.** `entities` lists 12 names; `entityShapes` types 10 of them,
keyed by the same names. `SearchIndex` and `IndexedDoc` have no shape.

**`designation` is always the feature id.** Five features declare one, and all five match; the schema and
the root `CLAUDE.md` both say it must. The only information the field carries is whether the feature has
a designation at all.

**Three encodings for "a module and its export".**

| Thing | Form |
|---|---|
| `services`, `repositories`, `seedHooks` | `"src/features/threads/be/services/chat.ts#chatService"` |
| `system.entry`, `plugin.entry`, `references` | `"src/features/threads/be/system.ts"` |
| `entityShapes` | `{ "source": "src/features/threads/be/types.ts", "type": "ThreadEntity" }` |

**Paths repeat their own location.** 84 path strings begin `src/features/<id>/`, and 36 of those name a
fully conventional file (`be/system.ts`, `fe/plugin.ts`, `settings.ts`). A feature's id is already the
directory name.

**One section is configuration that is never configured.** `partitionPolicy.excludedEntityTypes` is
declared empty by default-setup, the only built-in pack and so the only pack whose value is read
(`schema.ts:127`, `pack-registration.ts:435`). `loader.ts:211-216` deletes it from every external pack.
The only exclusion that takes effect is `SDK_EXCLUDED_ENTITY_TYPES = [TNode]` (`sdk-entities.ts:39`),
applied by the host regardless of any manifest. `generate-entries.ts:701-703` emits the object
unconditionally, so a pack that omits the key produces a byte-identical `pack-entry.ts`.

The strip is not over-caution. The list is unscoped in both directions: `manifest-schema.ts:187` accepts
`z.array(z.string())`, and `pack-registration.ts:432-437` concatenates every registration's entries into
one global list with no check that a pack named an entity it owns. A pack writing
`"excludedEntityTypes": ["Note"]` would route another pack's Notes to `volatileBackup`, which
`makePolicy` does not hydrate (`policy.ts:28`) and `exportDatabase` does not back up (`backup/index.ts:44`,
`databases = ['lmdb']`). Entity-type ownership is already enforced at registration
(`tests/packs/registration.spec.ts:157-171`), so the scoping exists — the policy list simply does not
use it.

The field's own description is also wrong. `manifest-schema.ts:187` reads "excluded from persistence
(in-memory only)", but `volatileBackup` is an on-disk LMDB store (`envs.ts:97`) that the sink writes
like any other; it is simply not hydrated at boot (`policy.ts:28`) and not in backups
(`backup/index.ts:44`). `abuddy db --volatile` reads it. Anything written from that description —
including the first draft of this goal — treats volatile data as lost when it is only unread.

**Four concerns are interleaved at the top level.** Ordered by weight in lines:

| Concern | Keys today |
|---|---|
| features | `features` (215) |
| extension points | `steps` (93), `dsl` (66), `commands` (12), `fe` (8), `artifacts` (3), `blocks` (3) |
| seeding | `seedFormats` (60), `boot` (35, holding `seed` and `seedPolicy`), `seedHooks` (7) |
| data model | `entityShapes` (44), `entities` (16), `relKinds` (7), `partitionPolicy` (5) |
| identity | `id`, `name`, `version`, `description`, `license`, `builtIn`, `hostVersion`, `$schema` |
| other | `defaultPlugin`, `migrations` |

`boot` holds lifecycle hooks *and* two seed keys, so seeding is spread across three top-level keys and
a nested one.

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
it gives the host) and `seed` (what data it ships). `lifecycle` and `migrations` do not — two keys is
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
seed                                             what data it ships
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
repositories, systems, plugins, references, seed hooks, seed compilers, step definitions, DSL entries,
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

**`data.entities` stays, as the home for an entity no feature owns.** A pack may have entities that
belong to no feature, and a pack may have no features at all — one that contributes only a data model
and a seed is a legitimate shape. That case needs a home, and it is the same key, one level up.
default-setup does not use it, which is the point: the pack-level map is where an entity goes when the
normal answer does not apply, not a second normal answer.

**Exactly one home per entity.** An entity declared both on a feature and in `data.entities` fails
`validate`, naming both. Entity types stay pack-global and collision-checked pack-wide (`checkEARS`,
`pack-registration.ts:228-243`, checks entities and relation kinds in one loop), so the split home
changes where a name is written, never what it is scoped to.

**The merge exists once, and two readers will not tell you when they miss it.** Twelve call sites
across three packages read `manifest.entities` today — `generate-entries.ts` (four), `manifest.ts`'s
provenance builder, `manifest-schema.ts`'s `seedHooks` refinement, `build.ts`'s snapshot,
`abuddy-host`'s `database/schema.ts` (two), `packs/runtime/loader.ts` and `packs-system.ts` (two, which
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
- `packs-system.ts:71`'s `readManifest(dir): Record<string, any> | null` is untyped, so
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

The section goes; the capability moves onto the declaration it describes:

```jsonc
{ "id": "code",
  "entities": {
    "Terminal":   "be/types.ts#TerminalEntity",
    "Scrollback": { "shape": "be/types.ts#ScrollbackEntity", "volatile": true }
  } }
```

An entity's value is a shape reference, `null` for no typed shape, or an object carrying `shape` and
`volatile`, wherever the entity is declared (Decision 3: its feature, or `data.entities`).
`generate-entries` derives `excludedEntityTypes` from the entities marked volatile, so the
plumbing below the manifest — `PackRegistration.ears`, `getRegisteredEARSPolicy`, `appPartitionPolicy`
— is unchanged, and the SDK's own `TNode` exclusion stays where it is.

**The restriction on external packs is dropped, and `loader.ts:211-216`'s strip is deleted rather than
replaced.** That strip exists because the exclusion list is unscoped: `manifest-schema.ts:187` accepts
`z.array(z.string())`, and `pack-registration.ts:432-437` pushes whatever a registration names into one
global list. A pack writing `"excludedEntityTypes": ["Note"]` would route another pack's Notes to
`volatileBackup`, which is not hydrated at boot and is outside backups — real destruction of data the
pack does not own.

A property on the entity cannot do that. A pack can only mark an entity it declares, and `registerPack`
already refuses a declaration another pack or the SDK owns (`EARS collision: entity type "Thread" —
pack "older-pack" vs "base-pack"`, `tests/packs/registration.spec.ts:157-171`). The hazard stops being
mitigated and becomes unrepresentable, which is why the restriction can go rather than being restated.

Two effects stay, both inside the declaring pack, and the schema's description must state them
correctly, which today's does not. `manifest-schema.ts:187` says "excluded from persistence (in-memory
only)" and that is wrong: `volatileBackup` is a real on-disk LMDB store (`envs.ts:97`) written like any
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

**6. `features[].designation` is deleted.** A feature that registers a designation writes
`"designated": true`. The registration keeps using the feature id, which is what it did anyway.

**7. Paths inside a feature are relative to `src/features/<id>/`, and a conventional one is written
`true`.** A key's presence says the feature has that thing; its value says where. `true` means the
conventional path (`be/system.ts`, `fe/plugin.ts`, `settings.ts`, `fe/references`), a string overrides
it, and an absent key means the feature does not have one — one meaning for absence, and nothing
inferred from the filesystem.

This is `package.json`'s `main`: a default value you may override, never a rule that decides whether the
thing exists. The manifest stays the answer to "what does this feature contribute", which a reader
cannot get from a directory listing, while `abuddy add feature` writes the conventional lines and
`abuddy doctor` reports a declared path that is missing or a conventional file that is present but
undeclared. Convention drives the tooling; it does not drive the semantics.

Paths outside a feature (seed data, extension registers, migrations) stay relative to the pack root.

**8. `system.entry` and `plugin.entry` collapse to `system` and `plugin`.** The wrapper object existed to
carry `outgoingEventsType`, `sendsTo` and `events`; those stay, so the value is either a string (the
entry) or an object with `entry` plus them. A feature with nothing but an entry writes the string.

**9. Every extension point moves under `extensions`**: `steps`, `artifacts`, `blocks`, `commands`, `dsl`,
and `fe` (tiptap plugins, app extensions). This is VS Code's `contributes`.

**10. Every seed concern moves under `seed`**: `formats` (was `seedFormats`), `hooks` (was `seedHooks`),
`sources` (was `boot.seed`), `policy` (was `boot.seedPolicy`).

`boot.seed` becomes `sources`, not `data`, for two reasons. It is what the entries are: every value is
a path or a `{ path, format, seeder }` over source files a compiler reads, and both the current schema
description ("Seed data sources") and `resolve.ts`'s `sourcePath` already use the word. And it keeps
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

`boot` holds three unrelated things today — `hooks`, `seed` and `seedPolicy` — and the seed pair leaves
for `seed`. What remains is one module path, so it becomes one key with a path as its value, named for
what it is rather than when it runs. (`earlySystem` is already a feature key, and stays one.)

An earlier draft grouped `lifecycle: { hooks, migrations }`. That fails the section test: two keys is
not a search, and neither changes when the other does — a pack adds a migration per release and touches
its hooks almost never. Both are a single module path, and a key whose value is a path needs no
container. `seed` remains a section because it genuinely is one: formats, hooks, data and policy are
four keys that change together whenever a seeded format changes.

**11. The schema is the specification and the docs follow it.** `manifest-schema.ts` gains a
`.describe()` on every field, `npm run generate:schema` regenerates `abuddy.schema.json`, and
`docs/public-facing/manifest.md` is rewritten from the new shape rather than edited.

**12. `defaultPlugin` moves onto the plugin it names.** It is loose content at the root today, and it
names a feature's plugin, so it belongs there: `"plugin": { "default": true }`, with `entry` omitted
meaning the conventional path exactly as `"plugin": true` does. The host already resolves it first-wins
across packs and warns on the second (`fe/pack-store.ts:63-66`), so nothing about the competition
changes; `validate` additionally rejects two features of one pack claiming it.

**13. Every feature carries an `about` line.** The manifest is the one place that says what a pack
contributes, and today it cannot say what any feature is *for* — only where its files are. A one-line
`about` is the highest-value thing the manifest can gain, and the only part of this goal that adds
content rather than moving it. `abuddy add feature` prompts for it and `validate` requires it.

**14. No compatibility of any kind.** No dual-read, no alias, no deprecation warning. Every manifest in
the repo — default-setup, both fixtures, the `abuddy init` scaffold, the packaged-authoring script's
generated pack — changes in the same phase as the schema section it depends on.

## Phases

Each phase changes one section of the schema, every manifest that uses it, and every consumer that reads
it, then leaves the full chain green. They are ordered so the largest mechanical wins land first.

### Phase 1 — the data model a pack declares

- Merge `entities` and `entityShapes` into one `entities` map, on the feature that owns each entity,
  with `data.entities` for an entity no feature owns (Decision 3), and `relKinds` into `data.relations`
  (Decision 4). Add `packEntities(manifest)` and route all twelve readers through it. Replace the `partitionPolicy` section with `volatile` on the entity (Decision 5): widen
  the entity value to `string | null | { shape, volatile }`, derive `excludedEntityTypes` in
  `generate-entries.ts:701-703` from the entities marked volatile, read the same in `schema.ts:127`, and
  delete `loader.ts:211-216` outright — there is nothing left to strip once a pack can only mark what it
  declares.
- Update `manifest-schema.ts`, `generate-entries.ts` (entity names, shapes, relation constants),
  `abuddy-host/src/database/schema.ts` (`readInstalledSchema`), `packs/runtime/loader.ts`,
  `packs/runtime/packs-system.ts` (both `PackInfo` builders, and give its `readManifest` a real return
  type in place of `Record<string, any>`), `abuddy-sdk/src/build/manifest.ts` (`ProvenanceManifest`'s
  own `entities` field, which does not fail to compile on its own),
  `abuddy-cli/src/commands/build.ts` (the snapshot, whose `PackTypeManifest` stays flat),
  `abuddy-cli/src/commands/add/manifest.ts` and `init.ts`'s scaffold.
- Update default-setup, both fixtures, and the pack that `tests/scripts/test-packaged-authoring.sh` writes.

**Done when:** `npm run generate:schema` is clean and `abuddy.schema.json` is committed; `abuddy build`
for default-setup produces a `src/__generated__/ears.ts` byte-identical to the one before the change
(diff it, and record that in the phase's commit); `partitionPolicy` appears in no manifest and in no schema, and
`loader.ts` no longer mentions it; every reader of a manifest's entities calls `packEntities` and a
spec fails when one open-codes the merge; `packages/abuddy-host/tests/packs/partition-policy.spec.ts` passes,
with a case added for an external pack marking its own entity volatile and that entity routing to
`volatileBackup`; the schema's description of `volatile` says persisted-but-not-hydrated and not
backed up, and the phrase "in-memory only" appears nowhere; `npm run typecheck`, `npm run test:unit`,
`npm run test:external-pack` pass.
Mutations: an entity listed with a shape reference whose export does not exist fails the build, naming
the entity; removing `TNode` from `SDK_EXCLUDED_ENTITY_TYPES` fails `partition-policy.spec.ts`; a pack
declaring an entity another pack owns still fails registration with the EARS collision message, which
is what keeps `volatile` scoped to its declarer; the same entity declared on a feature and in
`data.entities` fails `validate` naming both; a pack whose entities are all on features reports the
right `entityCount` in the Packs view, and reverting `packs-system.ts` to read the pack-level map alone
makes it report `0`; reverting `ProvenanceManifest` to its own `entities` field leaves the build green
and empties the snapshot's entity provenance, which a spec over a two-pack fixture must catch, since
the compiler will not.

### Phase 2 — `extensions`: everything a pack contributes

- Move `steps`, `artifacts`, `blocks`, `commands`, `dsl` and `fe` under `extensions` (Decision 9).
- Update `build.ts`, `dsl-defs.ts`, `add/{step,artifact,block}.ts`, `info.ts`, `doctor.ts`,
  `generate-entries.ts`, `loader.ts`.

**Done when:** the six keys are gone from the root of every manifest and the schema; `abuddy build`
produces identical `dist/` output for default-setup (compare the snapshot and `dist/defs/`);
`npm run test:unit` and `npm run test:external-pack` pass. Mutation: an extension point left at the root
fails schema validation with a message naming `extensions`.

### Phase 3 — `seed`: one section for seeding

- Move `seedFormats` → `seed.formats`, `seedHooks` → `seed.hooks`, `boot.seed` → `seed.sources`,
  `boot.seedPolicy` → `seed.policy`; what remains of `boot` becomes the flat `lifecycle: "<path>"`, and
  `migrations` stays a root key (Decision 10).
- Update `generate-entries.ts` (seeders, seed runtime), `build.ts` (compilers), the host's seed runtime.

**Done when:** no manifest has a `boot` key, `lifecycle` is a string in every manifest that has one,
and `migrations` is still a root key; the compiled seeds for default-setup are
byte-identical (`dist/*.seed.json`, `dist/seeds.json`); `tests/unit/seed-parity` passes;
`npm run compile`, `npm run test:unit`, `npm run test:external-pack` pass.

### Phase 4 — features: what they contribute, and where

- Delete `features[].designation`; add `"designated": true` (Decision 6).
- Make every path inside a feature relative to `src/features/<id>/`, with `true` for the conventional
  path and a string to override (Decision 7). A key's absence means the feature has no such thing.
- Collapse `system.entry`/`plugin.entry` to `system`/`plugin`, `true`, a string, or an object with
  `entry` plus `sendsTo`/`outgoingEventsType` (Decision 8).
- Move `defaultPlugin` onto the feature's plugin as `{ "default": true }` (Decision 12).
- Add `about` to every feature and require it in `validate.ts`; `abuddy add feature` prompts for it
  (Decision 13).
- Rename `features[].typesEntry` to `types`, relative to the feature's directory like every other
  feature path (Decision 7). Phase 1 already put `entities` on the feature; this phase makes its shape
  paths relative with the rest.
- Update `generate-entries.ts`, `validate.ts`, `add/feature.ts`, `init.ts`, `doctor.ts` and the loader.

**Done when:** no manifest contains the string `src/features/` inside a `features[]` entry; no manifest
contains `designation` or a root `defaultPlugin`; every feature in every manifest has an `about`; the generated `pack-entry.ts`,
`pack-entry-fe.ts` and `system-ids.ts` for default-setup are byte-identical to before; `npm run
typecheck` and the full unit chain pass. Mutations: a feature naming a path that escapes its directory
(`../other/be/system.ts`) fails validation; a feature with `"system": true` whose `be/system.ts` does
not exist fails the build naming the expected path, rather than silently having no system; a feature
without `about` fails `validate`; two features of one pack both claiming `plugin.default` fail
`validate`.

### Phase 5 — one encoding for a module reference

- Apply Decision 2 everywhere the previous phases have not already: one shared Zod refinement for
  `path#export`, used by services, repositories, seed hooks, compilers, step definitions, DSL entries and
  `migrations`.
- Bare path means the default export; the refinement rejects an empty export name (`"path#"`).

**Done when:** `manifest-schema.ts` has exactly one place that parses `#`; no `{ source, type }` object
remains in any manifest or the schema; the full chain passes. Mutation: `"path#"` and `"#export"` both
fail validation with the message naming the expected form.

### Phase 6 — the schema is the documentation

- Every field in `manifest-schema.ts` carries a `.describe()`; regenerate `abuddy.schema.json`. The
  entity value's description says what `null` means — the type exists and has no registered shape, so
  its rows read untyped — since that is the one value in the manifest a reader is most likely to take
  for "not set yet".
- Rewrite `docs/public-facing/manifest.md` from the new shape. Update
  `packages/default-setup/CLAUDE.md`, `packages/abuddy-cli/CLAUDE.md` and the root `CLAUDE.md` where they
  name a manifest key.
- Add a spec asserting the built-in pack's manifest has exactly the fourteen root keys the prompt block
  names, **in that order**, and no map whose keys equal its values, so the shape does not silently
  regrow. Naming them beats counting them: a count passes when one key is swapped for another, and the
  order is half of what makes a flat root readable (Decision 1). This spec, not Decision 1's prose, is
  what stops the root regrowing to 24 keys.
- Make `abuddy add`'s manifest writer emit the canonical order (`writeManifest`,
  `abuddy-cli/src/commands/add/manifest.ts:7`, the one line `add feature`, `add service`,
  `add migration` and `add step` all write through), so no `add` command can produce a file the spec
  then rejects.

**Done when:** `npm run schema:check` passes; `docs/public-facing/manifest.md` mentions no retired key
(`entityShapes`, `relKinds`, `seedFormats`, `seedHooks`, `partitionPolicy`, `designation`, `boot`,
`boot.seed`, `boot.seedPolicy`, `defaultPlugin`, and the six moved extension keys); the new spec passes.
Mutations: adding a 15th top-level key fails that spec; so does a map whose keys equal its values; so
does writing the fourteen keys in a different order.

## Deferred

- **Splitting the manifest into several files** (a `seeds.json` beside `abuddy.json`, say). One file that
  fits on a screen is the goal; more files is a different trade and not this one.
- **Replacing JSON with a typed authoring format** (a `abuddy.config.ts` the build imports). It would
  remove the `path#export` strings entirely in favour of real imports, and it changes how the CLI, the
  loader and the installed-pack layout all read a manifest. Worth its own goal if authors ask for it.
- **`permissions`**, which only fixtures declare and nothing enforces yet. Leave the key where it is.
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
- Generated output is the proof for Phases 1–4: compare `src/__generated__/` and `dist/` before and
  after, and treat any diff as a regression unless the phase says otherwise.
- Don't change the typed EARS types to make a call site compile
  (`packages/abuddy-sdk/TYPED-EARS.md`).
- Don't push, tag, open a PR, publish, or touch a real data dir.
