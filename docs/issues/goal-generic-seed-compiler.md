```
# Goal: manifest-driven seeding, with no SDK code per seeded entity type

Implement docs/issues/goal-generic-seed-compiler.md on the branch it names when
started: Background, Decisions, Phases, Constraints. Read it first. It builds
on 706dc987e (Document/Collection/Note/Settings/Secret as SDK-internal entity
types) and reverses its library and notes parts. Decisions are final: implement
them, don't reopen them or stop to ask. Where a detail isn't specified, pick the
conventional option, note it in the final summary, and keep going. No backward
compatibility: change formats and signatures, migrate every in-repo manifest,
fixture and template in the same change, and fix forward.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard
  or test is mutation-checked.
- Seeding a new entity type from markdown or JSON needs only `abuddy.json`
  (a format in `seedFormats`, an entry naming it, and optional seed hooks from
  the pack that owns the type), with no change under packages/abuddy-sdk. The
  fixture pack proves it.
- A pack that depends on default-setup seeds Notes and library documents with
  entries naming default-setup's formats (`{ "path", "format":
  "default-setup:notes" }`), no field maps or compiler modules of its own, and
  gets the same rows default-setup's own seeds get. A fixture proves it, and
  `test:packaged-authoring` proves it against a built dependency.
- The SDK has no library- or notes-specific compiler, seeder, importer, entity
  names or shapes. Flows, actions, prompts and settings keep specialty compilers.
- The parity gate passes against golden snapshots recorded from the old
  pipeline: the new pipeline seeds the same rows for default-setup's library,
  notes, actions and prompts (fields, relations, order, shortCodes, media,
  sourceHash), in every import mode. Notes are the one intended difference:
  they follow the fixed change-tracking rules (Decision 10).
- `npm run typecheck`, `schema:check`, `api:check`, and the api, sdk, cli,
  host, default-setup and renderer unit suites pass.
- `npm run test:external-pack`, the monorepo smoke E2E, the import-pack-seeds
  E2E, `npm run test:packaged-authoring`, and the example pack's
  `abuddy test --app-root <repo>` pass.
- You give a final summary: phase → done/deferred, evidence, and the
  conventional choices you made.

Never:
- push or tag. Commit as you go in logical chunks (conventional messages, no
  Co-Authored-By or session lines). Commit with `git commit -- <paths>` and
  check `git diff --cached` first: something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- pkill/killall Electron or node; launch the app outside the test env without
  an isolated ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or
  edit version/release metadata.
- change the typed EARS types (packages/abuddy-sdk/TYPED-EARS.md) to make a
  call site compile.
- loosen a failing assertion instead of investigating.
```

## Background

Investigation (2026-09-14) at `155c17ff9`, updated after `706dc987e` landed. Re-check each point against the branch when starting.

**Status (2026-09-14, at `15553c837`).** Phases 1–5 are done (`7ea8bb8cf`…`15553c837`). Seed entries carry their format settings inline (`format`, `fields`, `identity`, `tree`, `media`, `compiler` on each `boot.seed` entry), so a pack that depends on default-setup repeats default-setup's whole notes field map to seed a Note, and can't seed library documents without copying its compiler module. Default-setup's compiler modules live in `src/seeds/compilers/`; its seed hooks are still in the features (`features/notes/be/seed-hooks.ts`, `features/library/be/seed-hooks.ts`). Phase 6 replaces inline settings with named formats (Decisions 1, 6, 11 and 12 describe the result).

**The problem.** Every seeded entity type is hardcoded in the SDK. Adding one (a pack's own markdown-seeded type, or a new built-in) means a new compiler, a new seeder, a generator entry and usually entity names or shapes in `@abuddy/sdk`. `706dc987e` went further in the same direction: it moved Document, Collection and Note into `SDK_ENTITIES` so the SDK's seeders could type them, and added `libraryCommands`/`noteCommands` to `BuiltinRepositories`. This goal takes the other direction: the SDK owns a generic mechanism, and packs describe their seeds in `abuddy.json`.

**Compile stage.**
- `compilePack` (`abuddy-sdk/src/build/seed-compiler.ts`) iterates the `STANDARD_COMPILERS` map (`compilers/standard.ts`: actions, prompts, flows, library, notes, faqs, settings), not the manifest's keys. A manifest key with no compiler, or whose value isn't a string, is skipped silently.
- `buildPackConfigFromManifest` (`manifest-bridge.ts`) spreads `boot.seed` onto `PackConfig`'s top level as `Record<string, string>`, so a seed key named `name`, `setup`, `features` or `compilers` clobbers config. The schema accepts object entries (`SeedEntryConfigSchema`: `path`, `seeder`, `entityType`, `lookupField`), but an object entry never compiles.
- Each compiler's `write` names its own output file (`<key>.seed.json` via `seedFile`/`seedPath` in `build/manifest.ts`), with one quirk: `faqs` writes `faq.seed.json`, which `default-setup/src/features/settings/be/faqs.ts` reads.
- Library and notes both copy their `media/` into the same compiled `media/`.
- Custom compilers exist only through the deprecated `compile.config.ts`.
- Frontmatter: there is no YAML or frontmatter dependency. Each markdown compiler hand-rolls regexes for its own keys, and they only accept quoted string values.

**Library** (`compile-library.ts`, `library-utils.ts`, `seed/library-seeder.ts`).
- A directory tree: a directory is a Collection (its `_meta.md` frontmatter gives name, description); a `.md` file is a Document (frontmatter name, tags, defaulting to `['default']`; body split into sections by `parseMarkdownSections`). Names default to `toDisplayName(filename)`, which turns dashes into spaces.
- `media/` is copied to the compiled dir; the seeder copies each document's media and rewrites links to `media://<id>/` (a create is followed by an update, since the link needs the id).
- Identity: name, matched **globally** (`findWhere(Document, 'name', name)[0]`), not within the parent. `sourceHash` skips unchanged items; an item with no stored hash is treated as user-owned and skipped. Updates don't re-parent.
- The seeder calls `libraryCommands` through `BuiltinRepositories` (typed since `706dc987e`). `createDocument` (default-setup `library/be/repository/commands.ts`) also assigns the `DOC-n` shortCode and a display order (steps of 1000 across mixed collection and document siblings). Collections nest with `PARENT_OF`; documents are linked with `contains`. Writing rows directly would lose all of that.

**Notes** (`compile-notes.ts`, `seed/notes-seeder.ts`, `seed/import-notes.ts`).
- A directory with an `index.md` is a note with children; any other `.md` is a leaf note. Titles default to `toDisplayName(filename)`.
- Frontmatter: title, type, icon, favorite, hideCompletedChildren, completed. The body is kept raw.
- Identity: title plus parent (`findExistingNote` walks the `contains` link). Writes go through `noteCommands` (typed via `BuiltinRepositories` since `706dc987e`).
- **Change tracking is broken:** notes have no `sourceHash`, existing notes are always updated, and the seeder ignores `keep-existing` (only `wipe-and-replace` is honored).
- `noteCommands.create` does more than write rows: the `NOTE` shortCode prefix, `lastSeen: 0`, title validation, shifting siblings' `displayOrder` when an explicit order is given, and syncing `REFERENCES` links from the content (`link-utils.ts` `syncReferences`).

**FAQs.** Compiled from markdown (`question` is the first `# heading`, `answer` the rest, `category`/`order` from frontmatter-like lines); no seeder (`generateSeeders` skips `faqs`). `settings/be/faqs.ts` reads `faq.seed.json` directly.

**Hardcoded key lists.** `seedManifest.artifacts` in `generate-entries.ts` excludes `settings` and `faqs` by name. The seed-import UI's `toSeedInclude` (default-setup `settings/be/system.ts`), `previewPackSeeds`' default key list and the closed `PackSeedType` union (`build/preview.ts`) all list the six current keys.

**Runtime stage** (`generateSeeders` in `build/generate-entries.ts`).
- The factories apply to any pack: a pack that depends on default-setup can declare a `notes` or `library` seed key today, and the SDK's seeders call default-setup's repositories for it. No in-repo pack does this yet (the fixture and example packs seed only actions and flows), so no test covers it.
- A custom `seeder` path wins.
- `actions`/`prompts`, or any entry with `entityType`, get `createCollectionSeeder` (flat upsert by `lookupField` + `sourceHash`; defaults in `seed/standard-seeds.ts`).
- `flows`/`library`/`notes`/`settings` get `SEEDER_FACTORIES`.
- Shared plumbing: `seedData`, `shouldSeedAll`/`filterByInclude` (include sets from the seed-import UI), import modes (`wipe-and-replace` and the default merge), `SeedCounts`.

**Preview.** `seed/preview.ts` special-cases library and notes items to build the import dialog's tree.

**Settings.** Compiled from default-setup's `default-settings.ts` plus each feature's `settings.ts`. External packs' feature settings compile but are ignored at runtime (`api/src/packs/pack-seed.ts` `HOST_OWNED_SEED_SECTIONS`). Out of scope here beyond keeping it working; see Deferred.

## Decisions

1. **Formats are named in `seedFormats`; seed entries name a format.** A format says how a source becomes records. It's always defined in the manifest's top-level `seedFormats`, never inline in an entry:
   ```jsonc
   "seedFormats": {
     "notes": {
       "format": "markdown-tree",          // a built-in format: "markdown-tree" | "json" (or "compiler" instead)
       "entity": "Note",                   // omitted: compile-only (FAQs)
       "identity": ["title", "parent"],    // fields matched on; "parent" = the tree parent
       "tree": {
         "branch": "index.md",             // a directory's own file (library: "_meta.md")
         "branchEntity": "Note",           // defaults to `entity`
         "relKind": "contains"
       },
       "fields": {
         "title":    { "from": "frontmatter.title", "default": "filename", "type": "string" },  // "filename" = its display name
         "icon":     { "from": "frontmatter.icon", "type": "string" },
         "favorite": { "from": "frontmatter.favorite", "default": false },
         "content":  { "from": "body" }
       },
       "media": "media"                    // optional: copied to media/<key>/, links rewritten to media://<id>/
     },
     "library": { "compiler": "src/seeds/_compilers/library.ts", "entity": ["Collection", "Document"], "identity": ["name"], "media": "media" }
   },
   "boot": {
     "seed": {
       "actions": "src/seeds/actions",                                   // specialty keys: a path
       "notes":   { "path": "src/seeds/notes", "format": "notes" },       // this pack's format
       "team":    { "path": "src/seeds/team", "format": "default-setup:notes" },  // a dependency's format
       "custom":  { "seeder": "src/seeds/custom-seeder.ts" }             // a pack seeder module
     }
   }
   ```
   - The schema is the source of truth (`manifest-schema.ts` → `abuddy.schema.json`). `entityType` and `lookupField` are removed: flat JSON seeds use a format with `format: "json"`, `entity` and `identity`.
   - **A seed entry is `{ path, format }` or `{ seeder }`.** Any other key on an entry (`fields`, `identity`, `tree`, `entity`, `media`, `compiler`) is a validation error. Specialty keys (`actions`, `prompts`, `flows`, `settings`) accept a path string or `{ "path": … }`, nothing else.
   - **Format references.** An entry's `format` is a name in the pack's own `seedFormats` (`"notes"`), or `"<dependency id>:<name>"` for a format a dependency defines. The built-in formats (`markdown-tree`, `json`) are used only inside a `seedFormats` definition, never named by an entry.
   - **No overrides.** An entry can't change any part of the format it names. A pack that needs different settings (other frontmatter keys, another branch file, other defaults) defines its own format. Overrides may be added later as an additive key; see Deferred.
   - **Formats don't need ownership.** A pack can define a format for any entity type it can seed: its own, a dependency's or the SDK's. Rows still go through the owning pack's seed hooks (Decision 4), so the owner keeps control of what a valid row is.
   - Validation rejects: an unknown key on an entry or a format; a `fields` source that isn't `frontmatter.<name>`, `body`, `filename` or `path`; `fields` outside `markdown-tree`; a format with both or neither of `format` and `compiler`; an entry naming a format that doesn't exist, or a `<pack>:` prefix that isn't one of the pack's dependencies; and a format `entity` that neither the pack, its dependencies nor the SDK declares.
   - **Types.** Frontmatter is parsed as YAML 1.2, so an unquoted `2024` is a number. A field with `"type": "string"` is coerced to a string, so `title: 2024` stays the title the regexes read today.
   - **Records carry their entity type.** `entity` and `tree` produce records tagged with `entity` or `branchEntity`. `fields` and `identity` configure the generic `markdown-tree` compiler and the no-hooks seeder; they describe one field map, so a type whose branches and leaves need different fields (library's Collections and Documents) uses a compiler module that tags each record itself.
   - **Compiler modules.** A format's `compiler` names a module (in the pack defining the format) whose default export compiles the entry's `path` into records, each with its `entity`. The SDK exports the generic walker (`compileMarkdownTree(dir, options)`: sorted walk, frontmatter parsed with an established YAML/frontmatter library, branch files, display-name defaults, media) so a module can call it and post-process the items. The module also decides what each record's `sourceHash` covers; the generic default hashes the record's mapped fields and, for branches, its children's hashes. The build loads a pack's own compiler modules with `tsx/esm/api`, in the packaged app's CLI as well as in the monorepo; a dependency's come from its bundle (Decision 12).
2. **Built-in formats are limited.** `markdown-tree` and `json` (an array of records, or a tree with `children`), plus `compiler` modules. No other built-in formats until a pack needs one; packs name their own in `seedFormats`. The generic compiler emits raw bodies; type-specific body parsing (library sections, FAQ headings) belongs in the pack's compiler module.
3. **One generic seeder** in the SDK handles trees and flat arrays: the walk, identity lookup, `sourceHash` skipping, import modes, include sets, media, counts and preview items. It knows nothing about any pack's entity types. `createCollectionSeeder` and `seed/standard-seeds.ts` are deleted; actions and prompts use the generic seeder through their specialty keys' defaults.
4. **Seed hooks belong to the pack that owns the entity type.** Hooks are not part of a seed entry.
   - A pack declares them per entity type in its manifest (`seedHooks: { "Note": "src/seeds/hooks/notes.ts#noteSeedHooks" }`), only for entity types in its own `entities`. They stay separate from `seedFormats`: formats are per source and anyone may define one; hooks are per entity type and only the owner may. Its generated pack entry registers them in the SDK's seed-hook registry, keyed by entity type, the way steps are registered.
   - A hooks module may export `find(record, parentId)`, `create(record, parentId)`, `update(id, record)` and `remove(id)`. Hook modules are typed by the SDK's generic `SeedHooks<Record>` type, not by any SDK-owned entity shape.
   - The generic seeder looks hooks up by each record's entity type at seed time, so any pack seeding `Note` (default-setup or a pack that depends on it) gets default-setup's hooks.
   - When a `find` hook is registered, it owns identity and the format's `identity` is ignored. Without hooks the seeder writes rows directly (`createEntityWithDefaults`, `tree.relKind` links), which covers a single relation kind only.
   - Default-setup registers hooks for Note, Document and Collection that call their repository commands, so shortCodes, display order, `PARENT_OF`/`contains`, title validation, and `REFERENCES` sync on create and update keep working. Seed code lives with the seed sources: hook modules in `src/seeds/hooks/` (`notes.ts`, `library.ts`, importing the features' repositories through `#generated/repository`), compiler modules in `src/seeds/_compilers/`. Neither directory is scanned as seed source.
5. **Specialty compilers stay** for flows (the flow DSL and steps), actions and prompts (DSL defs), and settings. They keep their current keys, as a path string or `{ "path": … }`.
6. **Unknown seed keys fail the build.** A string entry whose key isn't a specialty key, and an object entry for a non-specialty key that isn't `{ path, format }` or `{ seeder }`, is an error naming the key, not a silent skip. Migrate default-setup, the fixture pack, the example pack's manifest and the scaffold templates in the same change.
7. **Library and notes leave the SDK.** Delete `compile-library.ts`, `library-utils.ts`, `compile-notes.ts`, `compile-faq.ts`, `library-seeder.ts`, `notes-seeder.ts`, `import-notes.ts` and any built-in names. `parseMarkdownSections` and the section content types move to default-setup's library compiler module. Move `ExportedItem`/`ExportedNote`/`CompiledFAQ` and the Document/Collection/Note shapes to default-setup, declared in its `abuddy.json` like its other entities. This reverses those parts of `706dc987e`; its Settings/Secret moves stay (see the Settings/Secrets internal-category plan).
8. **`BuiltinRepositories` loses its library and notes commands.** The SDK reaches them only through default-setup's registered seed hooks.
9. **FAQs use a default-setup format with a compiler module** (`src/seeds/_compilers/faqs.ts`, wrapping `compileMarkdownTree`: the question is the first `# heading`, which no field source expresses), with no `entity`: compiled, not seeded. The output is `faqs.seed.json`; `settings/be/faqs.ts` reads it, typed by `FAQItem` in `settings/be/types.ts`.
10. **Notes get proper change tracking.** Compiled notes carry `sourceHash` like library items, and the generic seeder applies the same rules to every entry:
    - `keep-existing` skips existing items.
    - `replace-on-collision` (and no mode) updates an existing item only when its stored hash differs from the compiled one: an unchanged `sourceHash` skips, and an item with no stored hash is treated as user-owned and skipped. This matches today's actions, prompts and library.
    - `wipe-and-replace` wipes first, then creates.
    This deliberately changes today's notes behavior (always updated, `keep-existing` ignored).

    **Accepted upgrade effects.** There is no data migration, adoption rule or hash compatibility:
    - Notes seeded before this change have no stored hash, so they count as user-owned and are never updated by seeds again (the welcome note included).
    - Library hashes aren't required to match the old ones. If they differ, seeded documents and collections are overwritten once, on the first boot after the upgrade, including user edits to them.
    Don't add code to avoid either.
12. **A pack's compiler modules ship with its bundle.** A dependency's source tree isn't installed, so `abuddy build` bundles every compiler module named in the pack's `seedFormats` into `dist/build/seed-compilers.mjs` (exports keyed by format name), next to `steps.build.mjs`, with the same bundler and no FE or runtime imports.
    - A dependent's build resolves `"<dep>:<name>"` formats from the dependency's snapshot manifest, and loads a compiler module from the dependency's `build/seed-compilers.mjs` (the build dir `resolveDepArtifacts` already returns for step modules). Its own formats' compiler modules still load from source with `tsx/esm/api`.
    - Built-in packs build the same file into `dist/build/`, so default-setup's formats work for dependents in the monorepo and in the packaged app alike.
    - Because every pack compiles a named format with the same settings and module, records and `sourceHash` for the same sources match across packs.
11. **The orchestrator owns seed files.** `compilePack` iterates the manifest's keys, and seeds live under `packConfig.seeds` rather than being spread onto `PackConfig`, each entry resolved to its format's settings (from the pack or a dependency) before compiling and code generation. It writes `<key>.seed.json` and `media/<key>/` itself (compilers return data, not files), and a seed index (keys, labels, counts) that preview and the import dialog read. `compile.config.ts` support is deleted.

## Phases

### Phase 1 — Spike and parity gate

- Write the parity harness first, and record **golden snapshots** from the current seeders: seed default-setup's library, notes, actions and prompts into a fresh in-memory EARS (with default-setup's repositories registered), snapshot the rows, and commit the snapshots as fixtures. Later phases compare the new pipeline against those files, so the gate survives Phase 4 deleting the old pipeline.
- The snapshot covers entity type, fields, `PARENT_OF`/`contains` links and their order, `DOC-n`/`NOTE` shortCodes, display order, `REFERENCES` links, media files and rewritten links, and `sourceHash`. Normalize ids and timestamps.
- Cover every import mode, an include set, a re-seed with unchanged and changed sources, a nested collection (a document change changes its ancestors' hashes), and frontmatter fixtures with unquoted values, arrays, booleans and values the regexes read as strings (`title: 2024`).
- Library keeps global name matching. Notes assert the Decision 10 rules, not the old behavior. Actions and prompts must match exactly.
- Build `compileMarkdownTree` and the generic seeder for notes only, in a test, without changing the manifest.
- Decide from the spike whether any library or notes behavior can't be expressed by Decision 1 plus seed hooks and compiler modules; record the answer in the final summary. Extend field sources minimally if needed; don't add formats.

**Done when:** the golden snapshots are committed and checked in CI, and the spike seeds notes as the harness expects.

### Phase 2 — Object entries end to end

- Schema (`SeedEntryConfigSchema`) with the fields in Decision 1 (without `entityType`/`lookupField`), plus `abuddy.schema.json` (`schema:check`).
- `manifest-bridge.ts` puts entries under `packConfig.seeds`; `compilePack` follows Decision 11 and routes `format` entries to the generic compiler, `compiler` entries to the pack module (loaded with `tsx/esm/api`), and specialty keys to their compilers. Delete `compile.config.ts` support in the SDK and CLI.
- `generateSeeders` emits a generic seeder registration for object entries. `seedManifest.artifacts` comes from the entries that have a seeder, not from a list of excluded names.
- The seed-hook registry (Decision 4): the manifest's `seedHooks`, schema and validation (an entity type the pack itself declares), pack-entry registration, and lookup by entity type in the generic seeder.
- `abuddy validate` (and the build) reports the Decision 1, 4 and 6 errors.
- The fixture pack (`tests/fixtures/external-pack`) seeds a pack-owned entity type from markdown with no hooks, and uses a `.ts` compiler module for a second entry. The external-pack test asserts the rows, and `test:packaged-authoring` builds a pack with a `.ts` compiler module through the packaged app's CLI.

**Done when:** a pack seeds its own entity type from `abuddy.json` alone, a `.ts` compiler module builds in both the monorepo and the packaged app, each validation error has a test, and a seed key named like a `PackConfig` field compiles correctly.

### Phase 3 — Migrate notes, then library

- Notes: a manifest object entry with `sourceHash` per Decision 10; default-setup registers seed hooks for `Note` that call `noteCommands`.
- Library: a manifest object entry with a default-setup compiler module (wrapping `compileMarkdownTree`, parsing sections, tagging records as Collection or Document), media, and seed hooks for `Document` and `Collection` that call `libraryCommands`.
- Actions and prompts: move to the generic seeder; delete `createCollectionSeeder`.
- A fixture pack that depends on default-setup seeds a Note from its own markdown, with no hooks of its own; its test asserts the `NOTE` shortCode, display order and `REFERENCES` links from default-setup's hooks.
- All behind the golden snapshots; remove the `SEEDER_FACTORIES` entries once each passes.

**Done when:** the parity gate passes for library, notes, actions and prompts with the SDK's library and notes seeders unused, and the dependent-pack fixture passes.

### Phase 4 — Delete the SDK specifics

- Delete the modules in Decision 7 and the `BuiltinRepositories` commands in Decision 8; move the types and shapes to default-setup.
- Make `seed/preview.ts` generic: preview items come from the generic seeder's records (label from the first identity field, children from the tree), and the keys come from the seed index (Decision 11). Remove the closed `PackSeedType` union and the default key list, and make the import dialog's `toSeedInclude` (default-setup `settings/be/system.ts`) take the keys from the index.
- `api:update` and review the `etc/*.api.md` diffs; update anything importing the moved types (renderer import dialog, host, CLI).
- Run the import-pack-seeds E2E and `test:packaged-authoring`.

- Add a test that fails when a module under `packages/abuddy-sdk/src/build` or `src/seed` imports or names a library or notes entity type (Document, Collection, Note, their shapes or exported seed types), with an explicit allowlist for anything legitimate.

**Done when:** that test passes and is mutation-checked, and the E2E and packaged-authoring runs pass.

### Phase 5 — FAQs and docs

- FAQs through a default-setup compiler module (Decision 9); remove the `faqs` special cases from the generator and compilers, and read `faqs.seed.json` in `settings/be/faqs.ts`.
- Docs: a `seeds.md` in `docs/public-facing` covering object entries, field sources and types, seed hooks (owned by the entity type's pack), compiler and seeder modules, change-tracking rules per import mode, and the accepted upgrade effects; update default-setup's `CLAUDE.md` and `src/seeds/CLAUDE.md`, the scaffold template, and the root `CLAUDE.md` seed line.

**Done when:** docs describe only the new mechanism and the scaffold's example uses it.

### Phase 6 — Named formats

- Schema: top-level `seedFormats` (name → format definition, name `^[a-z][a-z0-9-]*$`) and the Decision 1 entry shape (`{ path, format }` or `{ seeder }`); the old inline entry keys are removed. Every Decision 1 validation error has a test. `abuddy.schema.json`, `api:update`.
- Resolution: one SDK function resolves a pack's `boot.seed` against its own `seedFormats` and its dependencies' snapshot manifests, used by `buildPackConfigFromManifest`, `compilePack` and `generate-entries` (seeder registration options, seeded keys, entity validation). A dependency format carries where its compiler module loads from (Decision 12).
- Build (Decision 12): `abuddy build` writes `dist/build/seed-compilers.mjs` for packs whose formats name compiler modules; a dependent's build loads dependency compiler modules from it. The CLI passes dependency manifests and build dirs to the bridge.
- Move default-setup's seed hooks to `src/seeds/hooks/` (`features/notes/be/seed-hooks.ts` → `notes.ts`, `features/library/be/seed-hooks.ts` → `library.ts`) and update `seedHooks` paths, specs and docs.
- Migrate default-setup (`notes`, `library`, `faqs` formats; entries `{ path, format }`), the external fixture pack (a `memos` markdown format and a `quick-memos` compiler format), the dependent-pack fixture (`default-setup:notes` and `default-setup:library`, no field maps or compiler modules), `test:packaged-authoring` (its own compiler format, and `default-setup:notes` through the built dependency), the scaffold template, the parity harness and specs, and the import-pack-seeds E2E.
- The dependent-pack spec asserts identical rows (including `sourceHash`) to default-setup's own `notes` and `library` entries over the same sources, and that library media and sections come through default-setup's bundled compiler module.
- Docs: `seeds.md` and `manifest.md` describe `seedFormats`, entry references, no overrides, and which pack may define formats versus hooks; default-setup's `CLAUDE.md` and `src/seeds/CLAUDE.md` (including `hooks/` and `compilers/`).

**Done when:** no in-repo entry carries format settings; default-setup's seed hooks and compiler modules live under `src/seeds/`; the dependent-pack fixture and `test:packaged-authoring` seed default-setup's notes and library through `"default-setup:<name>"` with no field maps or compiler modules of their own; the parity gate, dependent-pack spec, external-pack test, import-pack-seeds E2E and example pack pass; and resolution, the bundled compiler loading and each validation error are mutation-checked.

## Deferred

- External packs' feature settings compile but are ignored at runtime (`HOST_OWNED_SEED_SECTIONS`). Not changed here.
- Settings/Secrets as an SDK-internal entity category, not in any facade. Planned separately.
- Entry overrides of a named format (e.g. changing one field of `default-setup:notes`). Not supported: a pack that needs different settings defines its own format. If added later, it's an additive key with objects merged by key (`tree`, `fields` by field name) and scalars, arrays and each field spec replaced.
- User edits don't clear a row's `sourceHash` (`updateDocument` keeps the stored hash when none is passed), so a later seed change overwrites edited seeded rows. Pre-existing; not changed here.

## Constraints

- Commit as you go in logical chunks, with conventional messages and no Co-Authored-By or Claude-Session lines. Check `git diff --cached` before each commit and commit with `git commit -- <paths>`. Never push or tag.
- Never publish externally: no `npm publish` (use `npm pack` and `--dry-run`), no real GitHub releases. CI workflows may be written, not triggered.
- Never use broad pkill/killall on Electron or node. E2E runs alongside the user's dev and prod apps in the `abuddy-test` namespace.
- Don't launch the app outside the test environment without isolating `ABUDDY_USER_DATA_DIR`.
- Never run bare tsc on `packages/preload`. Don't run `npm install` in the example pack. Don't edit monorepo version/release metadata.
- The typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`). Seeder code that needs runtime field names uses the untyped host `qx` or a hook, not a type change.
- Investigate failing tests before changing assertions; mutation-check every new guard or test, the parity gate included (break a field mapping, the notes hash skip, the manifest-key routing and the seed-hook lookup, and confirm each fails).
- No backward compatibility: no shims, deprecated fields or fallbacks for the old seed format, and no data migrations, adoption rules or hash compatibility for existing rows (Decision 10's accepted upgrade effects). Migrate every in-repo manifest, fixture and template and fix forward.
- Prefer libraries over hand-rolled code (an established YAML/frontmatter parser, since the repo has none; zod for the schema). No polling or hacky workarounds.
- External packs are first-class. Keep the in-repo fixture pack, the example pack (`/Users/spankyed/Develop/Projects/abuddy-external/example-pack`) and `test:packaged-authoring` passing throughout.
- Manual API boots: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node ../../scripts/with-source.mjs node dist/server.js`.
