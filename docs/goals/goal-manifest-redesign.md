> **Written in session** `23ab84ee-4c28-4dde-8ea9-641d6aa004cd` (Claude Code, 2026-09-19). Resume it with `claude -r 23ab84ee-4c28-4dde-8ea9-641d6aa004cd`.

```
# Goal: abuddy.json has a shape, not a pile of keys

Implement docs/goals/goal-manifest-redesign.md on a branch cut from master.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The Open decisions must be settled with the user before Phase 1; if any is
still marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility anywhere: no dual-read of old and new keys, no deprecation window, no
migration of an installed pack's manifest. Nothing has shipped — the newest tag is v0.3.14 and it
predates the pack machinery entirely. Change the schema, update every manifest in the repo in the same
change, and fix forward.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- packages/default-setup/abuddy.json has exactly these top-level keys and no others: $schema, id, name,
  version, description, license, builtIn, hostVersion, defaultPlugin, migrations, data, features,
  extensions, seed, boot. No key holds a map whose keys equal its values.
- No manifest in the repo spells a module reference two ways: `path#export` is the only form, and a
  bare path means the module's default export.
- `features[].designation` does not exist in any manifest or in the schema.
- `partitionPolicy` exists in no manifest and no schema; an entity is volatile by carrying
  `"volatile": true` in `data.entities`, any pack may mark one it declares, and `loader.ts` strips
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

Final, except where the Open decisions below override them.

**1. Identity stays flat at the root; everything else moves into named sections.** Root keys after this
goal: `$schema`, `id`, `name`, `version`, `description`, `license`, `builtIn`, `hostVersion`,
`dependencies`, `permissions`, `defaultPlugin`, `migrations`, plus the sections `data`, `features`,
`extensions` and `seed`. That is the package.json split: who this package is, then what it contains.

**2. One encoding for a module reference: `"path#export"`.** A bare `"path"` means the module's default
export. `entityShapes`' `{ source, type }` object goes. Every place that names a module — services,
repositories, systems, plugins, references, seed hooks, seed compilers, step definitions, DSL entries,
migrations — uses the same form, and the schema validates it with one shared refinement.

**3. `entities` and `entityShapes` merge into `data.entities`**, a map of entity name to its shape
reference, or `null` when the entity has no typed shape:

```json
"data": {
  "entities": {
    "Thread": "src/features/threads/be/types.ts#ThreadEntity",
    "SearchIndex": null
  }
}
```

**4. `relKinds` becomes `data.relations`, a list of wire values.** `["parent_of", "has", "relates_to"]`.
Codegen derives the `EARS.RelKind.PARENT_OF` constant by upper-casing. The phase proves the generated
`ears.ts` is unchanged.

**5. `partitionPolicy` becomes `volatile` on the entity that is volatile, and every pack may use it.**

The section goes; the capability moves onto the declaration it describes:

```jsonc
"data": {
  "entities": {
    "Note":       "src/features/notes/be/types.ts#NoteEntity",
    "Scrollback": { "shape": "src/features/code/be/types.ts#ScrollbackEntity", "volatile": true }
  }
}
```

An entity's value is a shape reference, `null` for no typed shape, or an object carrying `shape` and
`volatile`. `generate-entries` derives `excludedEntityTypes` from the entities marked volatile, so the
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

Two effects stay, both inside the declaring pack, and the schema's description says so: volatile data is
not in backups (`exportDatabase` defaults to `['lmdb']`), and a relation touching a volatile entity is
itself routed volatile (`routeRelation` → volatile if either side is) and so is not hydrated — a link
from a persisted entity to a volatile one does not survive a restart.

**6. `features[].designation` is deleted.** A feature that registers a designation writes
`"designated": true`. The registration keeps using the feature id, which is what it did anyway.

**7. Paths inside a feature are relative to `src/features/<id>/`.** `"system": "be/system.ts"`, not
`"system": "src/features/threads/be/system.ts"`. Paths outside a feature (seed data, extension
registers, migrations) stay relative to the pack root.

**8. `system.entry` and `plugin.entry` collapse to `system` and `plugin`.** The wrapper object existed to
carry `outgoingEventsType`, `sendsTo` and `events`; those stay, so the value is either a string (the
entry) or an object with `entry` plus them. A feature with nothing but an entry writes the string.

**9. Every extension point moves under `extensions`**: `steps`, `artifacts`, `blocks`, `commands`, `dsl`,
and `fe` (tiptap plugins, app extensions). This is VS Code's `contributes`.

**10. Every seed concern moves under `seed`**: `formats` (was `seedFormats`), `hooks` (was `seedHooks`),
`data` (was `boot.seed`), `policy` (was `boot.seedPolicy`). `boot` keeps only lifecycle: `hooks`
(`onInit`/`onShutdown`).

**11. The schema is the specification and the docs follow it.** `manifest-schema.ts` gains a
`.describe()` on every field, `npm run generate:schema` regenerates `abuddy.schema.json`, and
`docs/public-facing/manifest.md` is rewritten from the new shape rather than edited.

**12. No compatibility of any kind.** No dual-read, no alias, no deprecation warning. Every manifest in
the repo — default-setup, both fixtures, the `abuddy init` scaffold, the packaged-authoring script's
generated pack — changes in the same phase as the schema section it depends on.

## Open decisions (settle with the user before Phase 1)

**1. How far to take convention over configuration for feature paths.** — *open*

- **A. Relative paths, no defaults.** A feature always names its files, but relative to its own
  directory: `"system": "be/system.ts"`. Shortest change, nothing inferred, every file still visible in
  the manifest.
- **B. Relative paths with conventional defaults.** `be/system.ts`, `fe/plugin.ts`, `settings.ts` and
  `fe/references` are assumed to exist when the file is there, and the manifest names only deviations. A
  fully conventional feature becomes `{ "id": "notes", "repositories": { … } }`. Smallest manifest;
  the cost is that a file's presence becomes load-bearing, and `abuddy doctor` has to report what it
  inferred.
- **C. B, but only for `settings.ts` and `fe/references`**, which are already optional and always
  conventional, keeping `system` and `plugin` explicit because they decide whether a feature has a
  backend or a frontend at all.

**2. What the data section is called.** — *open*

- **A. `data`** — reads well next to `features` and `seed`, says what it holds.
- **B. `ears`** — names the engine the declarations are registered with, and matches `EARS` everywhere
  else in the codebase.

**3. Whether `defaultPlugin` stays at the root or becomes a feature flag.** — *open*

- **A. Root `"defaultPlugin": "threads"`** — one place to look, matches `"main"` in package.json.
- **B. `"default": true` on the feature's plugin** — colocated, and a feature moved between packs takes
  it along; the cost is that finding it means scanning the features array, and two features could set it.

## Phases

Each phase changes one section of the schema, every manifest that uses it, and every consumer that reads
it, then leaves the full chain green. They are ordered so the largest mechanical wins land first.

### Phase 1 — `data`: the model a pack declares

- Merge `entities` and `entityShapes` into `data.entities` (Decision 3), `relKinds` into `data.relations`
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
`volatileBackup`; `npm run typecheck`, `npm run test:unit`, `npm run test:external-pack` pass.
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
  `boot.seedPolicy` → `seed.policy` (Decision 10). `boot` keeps only `hooks`.
- Update `generate-entries.ts` (seeders, seed runtime), `build.ts` (compilers), the host's seed runtime.

**Done when:** `boot` holds only `hooks` in every manifest; the compiled seeds for default-setup are
byte-identical (`dist/*.seed.json`, `dist/seeds.json`); `tests/unit/seed-parity` passes;
`npm run compile`, `npm run test:unit`, `npm run test:external-pack` pass.

### Phase 4 — features: relative paths, no redundant designation

- Delete `features[].designation`; add `"designated": true` (Decision 6).
- Make every path inside a feature relative to `src/features/<id>/` (Decision 7), and apply whichever
  convention level Open decision 1 settles on.
- Collapse `system.entry`/`plugin.entry` to `system`/`plugin`, string or object (Decision 8).
- Update `generate-entries.ts`, `validate.ts`, `add/feature.ts`, `init.ts`, `doctor.ts` and the loader.

**Done when:** no manifest contains the string `src/features/` inside a `features[]` entry; no manifest
contains `designation`; the generated `pack-entry.ts`, `pack-entry-fe.ts` and `system-ids.ts` for
default-setup are byte-identical to before; `npm run typecheck` and the full unit chain pass. Mutation:
a feature naming a path that escapes its directory (`../other/be/system.ts`) fails validation.

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
- Add a spec asserting the built-in pack's manifest has exactly the fifteen top-level keys the prompt
  block names, and no map whose keys equal its values, so the shape does not silently regrow. Naming them
  beats counting them: a count passes when one key is swapped for another.

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
- **Backing up the volatile partition.** Decision 5 keeps `volatile` meaning both "not hydrated at boot"
  and "not in backups", because that is what the partition already does. Separating the two — backing up
  `volatileBackup` and letting `volatile` mean only "rebuildable, don't load at boot" — is the safer
  long-term shape, and it is a persistence change rather than a manifest one.

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
