> **Written in session** `23ab84ee-4c28-4dde-8ea9-641d6aa004cd` (Claude Code, 2026-09-19). Resume it with `claude -r 23ab84ee-4c28-4dde-8ea9-641d6aa004cd`.

```
# Goal: abuddy.json has a shape, not a pile of keys

Implement docs/goals/goal-manifest-redesign.md on a branch cut from master.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility anywhere: no dual-read of old and new keys, no deprecation window, no
migration of an installed pack's manifest. Nothing has shipped — the newest tag is v0.3.14 and it
predates the pack machinery entirely. Change the schema, update every manifest in the repo in the same
change, and fix forward.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- packages/default-setup/abuddy.json has exactly these top-level keys and no others: $schema, id, name,
  version, description, license, builtIn, hostVersion, relations, features, extensions, seed,
  lifecycle. No key holds a map whose keys equal its values.
- Every feature carries an `about` line, and every entity is declared by the feature that owns it.
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
without changing what a pack can declare.

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

**1. The root says what the pack *is*; every other key is one concern.**

> A root key is the pack's identity, what it requires, or what it may do. Everything else is one key
> per concern, and a concern with parts is an object.

Root after this goal: `$schema` (the file-format marker every JSON-Schema file carries), `id`, `name`,
`version`, `description`, `license`, `builtIn` — identity; `hostVersion`, `dependencies` — what it
requires; `permissions` — what it may do. Then one key each for the five concerns: `relations`,
`features`, `extensions`, `seed`, `lifecycle`.

Every key is covered by a clause, with `$schema` the single universal exception. An earlier draft said
"identity at the root, everything else in sections" and then kept `migrations`, `defaultPlugin` and
`relations` at the root anyway — four of eleven keys breaking their own rule, papered over with the
invented term "scalar identity field". A rule with four exceptions answers nothing; this one answers
where a new key goes, which is the only job it has.

`relations` is a bare list because the concern has one part. It does not follow entities into features
(Decision 3): an entity has a shape in one file and so has an owner, while a relation kind is a string
in a shared vocabulary — `parent_of` is used by three of default-setup's features — and nesting it
would invent an ownership that does not exist.

The enforcement is not the prose. Phase 6 adds a spec naming the exact root keys, which a later author
cannot reinterpret the way they can reinterpret a principle.

**2. One encoding for a module reference: `"path#export"`.** A bare `"path"` means the module's default
export. `entityShapes`' `{ source, type }` object goes. Every place that names a module — services,
repositories, systems, plugins, references, seed hooks, seed compilers, step definitions, DSL entries,
migrations — uses the same form, and the schema validates it with one shared refinement.

**3. `entities` and `entityShapes` merge, and move onto the feature that owns them.** Every one of
default-setup's twelve entities is declared by exactly one feature's directory, so the pack-level list
was hiding information the shapes already carried. The value is a shape reference, or `null` for an
entity with no typed shape:

```jsonc
{ "id": "notes",
  "entities": { "Note": "be/types.ts#NoteEntity" } }
```

Entity types stay pack-global and collision-checked; `generate-entries` flattens the features' maps into
the pack's set. A pack with an entity no feature owns declares it in a root `entities` map, which
default-setup does not need. `abuddy init` scaffolds a feature so a new pack's entity has an owner.

**4. `relKinds` becomes the root `relations`, a list of wire values.** `["parent_of", "has", "relates_to"]`.
Codegen derives the `EARS.RelKind.PARENT_OF` constant by upper-casing. The phase proves the generated
`ears.ts` is unchanged.

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
`volatile` (Decision 3 puts entities on their feature). `generate-entries` derives `excludedEntityTypes` from the entities marked volatile, so the
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
`data` (was `boot.seed`), `policy` (was `boot.seedPolicy`).

**`boot` becomes `lifecycle` and takes `migrations` from the root.** `startPacks` runs each pack's
`onInit`, then the migrations, then the seeds (`packs/runtime/start.ts:9-18`), so all three are boot
lifecycle and `migrations` was content loose at the root. `lifecycle` holds the two that are *code run
at a defined point* — `hooks` and `migrations`. `seed` stays a sibling because it is declarative data
and a compiler vocabulary (formats, identity, fields, policy), not a module to call; that is a
difference in kind, not in size.

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

- Merge `entities` and `entityShapes` onto the feature that owns each entity (Decision 3), `relKinds` into
  the root `relations`
  (Decision 4). Replace the `partitionPolicy` section with `volatile` on the entity (Decision 5): widen
  the entity value to `string | null | { shape, volatile }`, derive `excludedEntityTypes` in
  `generate-entries.ts:701-703` from the entities marked volatile, read the same in `schema.ts:127`, and
  delete `loader.ts:211-216` outright — there is nothing left to strip once a pack can only mark what it
  declares.
- Update `manifest-schema.ts`, `generate-entries.ts` (entity names, shapes, relation constants),
  `abuddy-host/src/database/schema.ts` (`readInstalledSchema`), `abuddy-cli/src/commands/add/manifest.ts`
  and `init.ts`'s scaffold.
- Update default-setup, both fixtures, and the pack that `tests/scripts/test-packaged-authoring.sh` writes.

**Done when:** `npm run generate:schema` is clean and `abuddy.schema.json` is committed; `abuddy build`
for default-setup produces a `src/__generated__/ears.ts` byte-identical to the one before the change
(diff it, and record that in the phase's commit); `partitionPolicy` appears in no manifest and in no schema, and
`loader.ts` no longer mentions it; `packages/abuddy-host/tests/packs/partition-policy.spec.ts` passes,
with a case added for an external pack marking its own entity volatile and that entity routing to
`volatileBackup`; the schema's description of `volatile` says persisted-but-not-hydrated and not
backed up, and the phrase "in-memory only" appears nowhere; `npm run typecheck`, `npm run test:unit`,
`npm run test:external-pack` pass.
Mutations: an entity listed with a shape reference whose export does not exist fails the build, naming
the entity; removing `TNode` from `SDK_EXCLUDED_ENTITY_TYPES` fails `partition-policy.spec.ts`; a pack
declaring an entity another pack owns still fails registration with the EARS collision message, which
is what keeps `volatile` scoped to its declarer.

### Phase 2 — `extensions`: everything a pack contributes

- Move `steps`, `artifacts`, `blocks`, `commands`, `dsl` and `fe` under `extensions` (Decision 9).
- Update `build.ts`, `dsl-defs.ts`, `add/{step,artifact,block}.ts`, `info.ts`, `doctor.ts`,
  `generate-entries.ts`, `loader.ts`.

**Done when:** the six keys are gone from the root of every manifest and the schema; `abuddy build`
produces identical `dist/` output for default-setup (compare the snapshot and `dist/defs/`);
`npm run test:unit` and `npm run test:external-pack` pass. Mutation: an extension point left at the root
fails schema validation with a message naming `extensions`.

### Phase 3 — `seed`: one section for seeding

- Move `seedFormats` → `seed.formats`, `seedHooks` → `seed.hooks`, `boot.seed` → `seed.data`,
  `boot.seedPolicy` → `seed.policy`; rename `boot` to `lifecycle` and move the root `migrations` into it
  (Decision 10).
- Update `generate-entries.ts` (seeders, seed runtime), `build.ts` (compilers), the host's seed runtime.

**Done when:** no manifest has a `boot` key or a root `migrations`, and `lifecycle` holds `hooks` and
`migrations`; the compiled seeds for default-setup are
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
- Move each entity onto the feature that owns it (Decision 3), which Phase 1 prepared.
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

- Every field in `manifest-schema.ts` carries a `.describe()`; regenerate `abuddy.schema.json`.
- Rewrite `docs/public-facing/manifest.md` from the new shape. Update
  `packages/default-setup/CLAUDE.md`, `packages/abuddy-cli/CLAUDE.md` and the root `CLAUDE.md` where they
  name a manifest key.
- Add a spec asserting the built-in pack's manifest has exactly the thirteen root keys the prompt
  block names, and no map whose keys equal its values, so the shape does not silently regrow. Naming them
  beats counting them: a count passes when one key is swapped for another. This spec, not Decision 1's
  prose, is what stops the root regrowing to 24 keys.

**Done when:** `npm run schema:check` passes; `docs/public-facing/manifest.md` mentions no retired key
(`entityShapes`, `relKinds`, `seedFormats`, `seedHooks`, `partitionPolicy`, `designation`,
`boot.seed`, `boot.seedPolicy`, and the six moved extension keys); the new spec passes. Mutation: adding
a 13th top-level key, or a map whose keys equal its values, fails that spec.

## Deferred

- **Splitting the manifest into several files** (a `seeds.json` beside `abuddy.json`, say). One file that
  fits on a screen is the goal; more files is a different trade and not this one.
- **Replacing JSON with a typed authoring format** (a `abuddy.config.ts` the build imports). It would
  remove the `path#export` strings entirely in favour of real imports, and it changes how the CLI, the
  loader and the installed-pack layout all read a manifest. Worth its own goal if authors ask for it.
- **`permissions`**, which only fixtures declare and nothing enforces yet. Leave the key where it is.
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
