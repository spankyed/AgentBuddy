```
# Goal: manifest-driven applying, with no SDK code per written entity type

Implement docs/archive/goals/goal-generic-content-compiler.md on the branch it names when
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
- Applying a new entity type from markdown or JSON needs only `apack.json`
  (a format in `content.formats`, an entry naming it, and optional content hooks from
  the pack that owns the type), with no change under packages/apack-sdk. The
  fixture pack proves it.
- A pack that depends on default-setup content Notes and library documents with
  entries naming default-setup's formats (`{ "path", "format":
  "default-setup:notes" }`), no field maps or compiler modules of its own, and
  gets the same rows default-setup's own content get. A fixture proves it, and
  `test:packaged-authoring` proves it against a built dependency.
- The SDK has no library- or notes-specific compiler, applier, importer, entity
  names or shapes. Flows, actions, prompts and settings keep specialty compilers.
- The parity gate passes against golden snapshots recorded from the old
  pipeline: the new pipeline content the same rows for default-setup's library,
  notes, actions and prompts (fields, relations, order, shortCodes, media,
  sourceHash), in every import mode. Notes are the one intended difference:
  they follow the fixed change-tracking rules (Decision 10).
- `npm run typecheck`, `schema:check`, `api:check`, and the api, sdk, cli,
  host, default-setup and renderer unit suites pass.
- `npm run test:external-pack`, the monorepo smoke E2E, the import-pack-content
  E2E, `npm run test:packaged-authoring`, and the example pack's
  `apack test --app-root <repo>` pass.
- You give a final summary: phase → done/deferred, evidence, and the
  conventional choices you made.

Never:
- push or tag. Commit as you go in logical chunks (conventional messages, no
  Co-Authored-By or session lines). Commit with `git commit -- <paths>` and
  check `git diff --cached` first: something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- pkill/killall Electron or node; launch the app outside the test env without
  an isolated APACK_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or
  edit version/release metadata.
- change the typed EARS types (packages/apack-sdk/TYPED-EARS.md) to make a
  call site compile.
- loosen a failing assertion instead of investigating.
```

## Background

Investigation (2026-09-14) at `155c17ff9`, updated after `706dc987e` landed. Re-check each point against the branch when starting.

**Status (2026-09-14, at `15553c837`).** Phases 1–5 are done (`7ea8bb8cf`…`15553c837`). Content entries carry their format settings inline (`format`, `fields`, `identity`, `tree`, `media`, `compiler` on each `content.sources` entry), so a pack that depends on default-setup repeats default-setup's whole notes field map to apply a Note, and can't content library documents without copying its compiler module. Default-setup's compiler modules live in `src/content/compilers/`; its content hooks are still in the features (`features/notes/be/content-hooks.ts`, `features/library/be/content-hooks.ts`). Phase 6 replaces inline settings with named formats (Decisions 1, 6, 11 and 12 describe the result).

**The problem.** Every written entity type is hardcoded in the SDK. Adding one (a pack's own markdown-written type, or a new built-in) means a new compiler, a new applier, a generator entry and usually entity names or shapes in `@apack/sdk`. `706dc987e` went further in the same direction: it moved Document, Collection and Note into `SDK_ENTITIES` so the SDK's appliers could type them, and added `libraryCommands`/`noteCommands` to `BuiltinRepositories`. This goal takes the other direction: the SDK owns a generic mechanism, and packs describe their content in `apack.json`.

**Compile stage.**
- `compilePack` (`apack-sdk/src/build/content-compiler.ts`) iterates the `STANDARD_COMPILERS` map (`compilers/standard.ts`: actions, prompts, flows, library, notes, faqs, settings), not the manifest's keys. A manifest key with no compiler, or whose value isn't a string, is skipped silently.
- `buildPackConfigFromManifest` (`manifest-bridge.ts`) spreads `content.sources` onto `PackConfig`'s top level as `Record<string, string>`, so a content key named `name`, `setup`, `features` or `compilers` clobbers config. The schema accepts object entries (`ContentSourceSchema`: `path`, `applier`, `entityType`, `lookupField`), but an object entry never compiles.
- Each compiler's `write` names its own output file (`<key>.content.json` via `contentFile`/`contentPath` in `build/manifest.ts`), with one quirk: `faqs` writes `faq.content.json`, which `default-setup/src/features/settings/be/faqs.ts` reads.
- Library and notes both copy their `media/` into the same compiled `media/`.
- Custom compilers exist only through the deprecated `compile.config.ts`.
- Frontmatter: there is no YAML or frontmatter dependency. Each markdown compiler hand-rolls regexes for its own keys, and they only accept quoted string values.

**Library** (`compile-library.ts`, `library-utils.ts`, `content/library-applier.ts`).
- A directory tree: a directory is a Collection (its `_meta.md` frontmatter gives name, description); a `.md` file is a Document (frontmatter name, tags, defaulting to `['default']`; body split into sections by `parseMarkdownSections`). Names default to `toDisplayName(filename)`, which turns dashes into spaces.
- `media/` is copied to the compiled dir; the applier copies each document's media and rewrites links to `media://<id>/` (a create is followed by an update, since the link needs the id).
- Identity: name, matched **globally** (`findWhere(Document, 'name', name)[0]`), not within the parent. `sourceHash` skips unchanged items; an item with no stored hash is treated as user-owned and skipped. Updates don't re-parent.
- The applier calls `libraryCommands` through `BuiltinRepositories` (typed since `706dc987e`). `createDocument` (default-setup `library/be/repository/commands.ts`) also assigns the `DOC-n` shortCode and a display order (steps of 1000 across mixed collection and document siblings). Collections nest with `PARENT_OF`; documents are linked with `contains`. Writing rows directly would lose all of that.

**Notes** (`compile-notes.ts`, `content/notes-applier.ts`, `content/import-notes.ts`).
- A directory with an `index.md` is a note with children; any other `.md` is a leaf note. Titles default to `toDisplayName(filename)`.
- Frontmatter: title, type, icon, favorite, hideCompletedChildren, completed. The body is kept raw.
- Identity: title plus parent (`findExistingNote` walks the `contains` link). Writes go through `noteCommands` (typed via `BuiltinRepositories` since `706dc987e`).
- **Change tracking is broken:** notes have no `sourceHash`, existing notes are always updated, and the applier ignores `keep-existing` (only `wipe-and-replace` is honored).
- `noteCommands.create` does more than write rows: the `NOTE` shortCode prefix, `lastSeen: 0`, title validation, shifting siblings' `displayOrder` when an explicit order is given, and syncing `REFERENCES` links from the content (`link-utils.ts` `syncReferences`).

**FAQs.** Compiled from markdown (`question` is the first `# heading`, `answer` the rest, `category`/`order` from frontmatter-like lines); no applier (`generateAppliers` skips `faqs`). `settings/be/faqs.ts` reads `faq.content.json` directly.

**Hardcoded key lists.** `contentManifest.artifacts` in `generate-entries.ts` excludes `settings` and `faqs` by name. The apply-import UI's `toContentSelection` (default-setup `settings/be/system.ts`), `previewPackContent`' default key list and the closed `PackContentType` union (`build/preview.ts`) all list the six current keys.

**Runtime stage** (`generateAppliers` in `build/generate-entries.ts`).
- The factories apply to any pack: a pack that depends on default-setup can declare a `notes` or `library` content key today, and the SDK's appliers call default-setup's repositories for it. No in-repo pack does this yet (the fixture and example packs content only actions and flows), so no test covers it.
- A custom `applier` path wins.
- `actions`/`prompts`, or any entry with `entityType`, get `createCollectionApplier` (flat upsert by `lookupField` + `sourceHash`; defaults in `content/standard-content.ts`).
- `flows`/`library`/`notes`/`settings` get `APPLIER_FACTORIES`.
- Shared plumbing: `contentData`, `shouldWriteAll`/`filterByInclude` (include sets from the apply-import UI), import modes (`wipe-and-replace` and the default merge), `ContentCounts`.

**Preview.** `content/preview.ts` special-cases library and notes items to build the import dialog's tree.

**Settings.** Compiled from default-setup's `default-settings.ts` plus each feature's `settings.ts`. External packs' feature settings register as defaults with the pack (`@apack/sdk/framework` `packSettingsRegistry`); only built-in packs have a settings content.

## Decisions

1. **Formats are named in `content.formats`; content entries name a format.** A format says how a source becomes records. It's always defined in the manifest's top-level `content.formats`, never inline in an entry:
   ```jsonc
   "content.formats": {
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
     "library": { "compiler": "src/content/_compilers/library.ts", "entity": ["Collection", "Document"], "identity": ["name"], "media": "media" }
   },
   "boot": {
     "content": {
       "actions": "src/content/actions",                                   // specialty keys: a path
       "notes":   { "path": "src/content/notes", "format": "notes" },       // this pack's format
       "team":    { "path": "src/content/team", "format": "default-setup:notes" },  // a dependency's format
       "custom":  { "applier": "src/content/custom-applier.ts" }             // a pack applier module
     }
   }
   ```
   - The schema is the source of truth (`manifest-schema.ts` → `apack.schema.json`). `entityType` and `lookupField` are removed: flat JSON content use a format with `format: "json"`, `entity` and `identity`.
   - **A content entry is `{ path, format }` or `{ applier }`.** Any other key on an entry (`fields`, `identity`, `tree`, `entity`, `media`, `compiler`) is a validation error. Specialty keys (`actions`, `prompts`, `flows`, `settings`) accept a path string or `{ "path": … }`, nothing else.
   - **Format references.** An entry's `format` is a name in the pack's own `content.formats` (`"notes"`), or `"<dependency id>:<name>"` for a format a dependency defines. The built-in formats (`markdown-tree`, `json`) are used only inside a `content.formats` definition, never named by an entry.
   - **No overrides.** An entry can't change any part of the format it names. A pack that needs different settings (other frontmatter keys, another branch file, other defaults) defines its own format. Overrides may be added later as an additive key; see Deferred.
   - **Formats don't need ownership.** A pack can define a format for any entity type it can apply: its own, a dependency's or the SDK's. Rows still go through the owning pack's content hooks (Decision 4), so the owner keeps control of what a valid row is.
   - Validation rejects: an unknown key on an entry or a format; a `fields` source that isn't `frontmatter.<name>`, `body`, `filename` or `path`; `fields` outside `markdown-tree`; a format with both or neither of `format` and `compiler`; an entry naming a format that doesn't exist, or a `<pack>:` prefix that isn't one of the pack's dependencies; and a format `entity` that neither the pack, its dependencies nor the SDK declares.
   - **Types.** Frontmatter is parsed as YAML 1.2, so an unquoted `2024` is a number. A field with `"type": "string"` is coerced to a string, so `title: 2024` stays the title the regexes read today.
   - **Records carry their entity type.** `entity` and `tree` produce records tagged with `entity` or `branchEntity`. `fields` and `identity` configure the generic `markdown-tree` compiler and the no-hooks applier; they describe one field map, so a type whose branches and leaves need different fields (library's Collections and Documents) uses a compiler module that tags each record itself.
   - **Compiler modules.** A format's `compiler` names a module (in the pack defining the format) whose default export compiles the entry's `path` into records, each with its `entity`. The SDK exports the generic walker (`compileMarkdownTree(dir, options)`: sorted walk, frontmatter parsed with an established YAML/frontmatter library, branch files, display-name defaults, media) so a module can call it and post-process the items. The module also decides what each record's `sourceHash` covers; the generic default hashes the record's mapped fields and, for branches, its children's hashes. The build loads a pack's own compiler modules with `tsx/esm/api`, in the packaged app's CLI as well as in the monorepo; a dependency's come from its bundle (Decision 12).
2. **Built-in formats are limited.** `markdown-tree` and `json` (an array of records, or a tree with `children`), plus `compiler` modules. No other built-in formats until a pack needs one; packs name their own in `content.formats`. The generic compiler emits raw bodies; type-specific body parsing (library sections, FAQ headings) belongs in the pack's compiler module.
3. **One generic applier** in the SDK handles trees and flat arrays: the walk, identity lookup, `sourceHash` skipping, import modes, include sets, media, counts and preview items. It knows nothing about any pack's entity types. `createCollectionApplier` and `content/standard-content.ts` are deleted; actions and prompts use the generic applier through their specialty keys' defaults.
4. **Content hooks belong to the pack that owns the entity type.** Hooks are not part of a content entry.
   - A pack declares them per entity type in its manifest (`contentWriters: { "Note": "src/content/hooks/notes.ts#noteContentWriter" }`), only for entity types in its own `entities`. They stay separate from `content.formats`: formats are per source and anyone may define one; hooks are per entity type and only the owner may. Its generated pack entry registers them in the SDK's content-writer registry, keyed by entity type, the way steps are registered.
   - A hooks module may export `find(record, parentId)`, `create(record, parentId)`, `update(id, record)` and `remove(id)`. Hook modules are typed by the SDK's generic `ContentWriter<Record>` type, not by any SDK-owned entity shape.
   - The generic applier looks hooks up by each record's entity type at content time, so any pack applying `Note` (default-setup or a pack that depends on it) gets default-setup's hooks.
   - When a `find` hook is registered, it owns identity and the format's `identity` is ignored. Without hooks the applier writes rows directly (`createEntityWithDefaults`, `tree.relKind` links), which covers a single relation kind only.
   - Default-setup registers hooks for Note, Document and Collection that call their repository commands, so shortCodes, display order, `PARENT_OF`/`contains`, title validation, and `REFERENCES` sync on create and update keep working. Content code lives with the content sources: hook modules in `src/content/hooks/` (`notes.ts`, `library.ts`, importing the features' repositories through `#generated/repository`), compiler modules in `src/content/_compilers/`. Neither directory is scanned as content source.
5. **Specialty compilers stay** for flows (the flow DSL and steps), actions and prompts (DSL defs), and settings. They keep their current keys, as a path string or `{ "path": … }`.
6. **Unknown content keys fail the build.** A string entry whose key isn't a specialty key, and an object entry for a non-specialty key that isn't `{ path, format }` or `{ applier }`, is an error naming the key, not a silent skip. Migrate default-setup, the fixture pack, the example pack's manifest and the scaffold templates in the same change.
7. **Library and notes leave the SDK.** Delete `compile-library.ts`, `library-utils.ts`, `compile-notes.ts`, `compile-faq.ts`, `library-applier.ts`, `notes-applier.ts`, `import-notes.ts` and any built-in names. `parseMarkdownSections` and the section content types move to default-setup's library compiler module. Move `ExportedItem`/`ExportedNote`/`CompiledFAQ` and the Document/Collection/Note shapes to default-setup, declared in its `apack.json` like its other entities. This reverses those parts of `706dc987e`; its Settings/Secret moves stay (see the Settings/Secrets internal-category plan).
8. **`BuiltinRepositories` loses its library and notes commands.** The SDK reaches them only through default-setup's registered content hooks.
9. **FAQs use a default-setup format with a compiler module** (`src/content/_compilers/faqs.ts`, wrapping `compileMarkdownTree`: the question is the first `# heading`, which no field source expresses), with no `entity`: compiled, not written. The output is `faqs.content.json`; `settings/be/faqs.ts` reads it, typed by `FAQItem` in `settings/be/types.ts`.
10. **Notes get proper change tracking.** Compiled notes carry `sourceHash` like library items, and the generic applier applies the same rules to every entry:
    - `keep-existing` skips existing items.
    - `replace-on-collision` (and no mode) updates an existing item only when its stored hash differs from the compiled one: an unchanged `sourceHash` skips, and an item with no stored hash is treated as user-owned and skipped. This matches today's actions, prompts and library.
    - `wipe-and-replace` wipes first, then creates.
    This deliberately changes today's notes behavior (always updated, `keep-existing` ignored).

    **Accepted upgrade effects.** There is no data migration, adoption rule or hash compatibility:
    - Notes written before this change have no stored hash, so they count as user-owned and are never updated by content again (the welcome note included).
    - Library hashes aren't required to match the old ones. If they differ, written documents and collections are overwritten once, on the first boot after the upgrade, including user edits to them.
    Don't add code to avoid either.
12. **A pack's compiler modules ship with its bundle.** A dependency's source tree isn't installed, so `apack build` bundles every compiler module named in the pack's `content.formats` into `dist/build/content-compilers.mjs` (exports keyed by format name), next to `steps.build.mjs`, with the same bundler and no FE or runtime imports.
    - A dependent's build resolves `"<dep>:<name>"` formats from the dependency's snapshot manifest, and loads a compiler module from the dependency's `build/content-compilers.mjs` (the build dir `resolveDepArtifacts` already returns for step modules). Its own formats' compiler modules still load from source with `tsx/esm/api`.
    - Built-in packs build the same file into `dist/build/`, so default-setup's formats work for dependents in the monorepo and in the packaged app alike.
    - Because every pack compiles a named format with the same settings and module, records and `sourceHash` for the same sources match across packs.
11. **The orchestrator owns content files.** `compilePack` iterates the manifest's keys, and content live under `packConfig.content` rather than being spread onto `PackConfig`, each entry resolved to its format's settings (from the pack or a dependency) before compiling and code generation. It writes `<key>.content.json` and `media/<key>/` itself (compilers return data, not files), and a content index (keys, labels, counts) that preview and the import dialog read. `compile.config.ts` support is deleted.

## Phases

### Phase 1 — Spike and parity gate

- Write the parity harness first, and record **golden snapshots** from the current appliers: content default-setup's library, notes, actions and prompts into a fresh in-memory EARS (with default-setup's repositories registered), snapshot the rows, and commit the snapshots as fixtures. Later phases compare the new pipeline against those files, so the gate survives Phase 4 deleting the old pipeline.
- The snapshot covers entity type, fields, `PARENT_OF`/`contains` links and their order, `DOC-n`/`NOTE` shortCodes, display order, `REFERENCES` links, media files and rewritten links, and `sourceHash`. Normalize ids and timestamps.
- Cover every import mode, an include set, a re-apply with unchanged and changed sources, a nested collection (a document change changes its ancestors' hashes), and frontmatter fixtures with unquoted values, arrays, booleans and values the regexes read as strings (`title: 2024`).
- Library keeps global name matching. Notes assert the Decision 10 rules, not the old behavior. Actions and prompts must match exactly.
- Build `compileMarkdownTree` and the generic applier for notes only, in a test, without changing the manifest.
- Decide from the spike whether any library or notes behavior can't be expressed by Decision 1 plus content hooks and compiler modules; record the answer in the final summary. Extend field sources minimally if needed; don't add formats.

**Done when:** the golden snapshots are committed and checked in CI, and the spike content notes as the harness expects.

### Phase 2 — Object entries end to end

- Schema (`ContentSourceSchema`) with the fields in Decision 1 (without `entityType`/`lookupField`), plus `apack.schema.json` (`schema:check`).
- `manifest-bridge.ts` puts entries under `packConfig.content`; `compilePack` follows Decision 11 and routes `format` entries to the generic compiler, `compiler` entries to the pack module (loaded with `tsx/esm/api`), and specialty keys to their compilers. Delete `compile.config.ts` support in the SDK and CLI.
- `generateAppliers` emits a generic applier registration for object entries. `contentManifest.artifacts` comes from the entries that have a applier, not from a list of excluded names.
- The content-writer registry (Decision 4): the manifest's `contentWriters`, schema and validation (an entity type the pack itself declares), pack-entry registration, and lookup by entity type in the generic applier.
- `apack validate` (and the build) reports the Decision 1, 4 and 6 errors.
- The fixture pack (`tests/fixtures/external-pack`) content a pack-owned entity type from markdown with no hooks, and uses a `.ts` compiler module for a second entry. The external-pack test asserts the rows, and `test:packaged-authoring` builds a pack with a `.ts` compiler module through the packaged app's CLI.

**Done when:** a pack content its own entity type from `apack.json` alone, a `.ts` compiler module builds in both the monorepo and the packaged app, each validation error has a test, and a content key named like a `PackConfig` field compiles correctly.

### Phase 3 — Migrate notes, then library

- Notes: a manifest object entry with `sourceHash` per Decision 10; default-setup registers content hooks for `Note` that call `noteCommands`.
- Library: a manifest object entry with a default-setup compiler module (wrapping `compileMarkdownTree`, parsing sections, tagging records as Collection or Document), media, and content hooks for `Document` and `Collection` that call `libraryCommands`.
- Actions and prompts: move to the generic applier; delete `createCollectionApplier`.
- A fixture pack that depends on default-setup content a Note from its own markdown, with no hooks of its own; its test asserts the `NOTE` shortCode, display order and `REFERENCES` links from default-setup's hooks.
- All behind the golden snapshots; remove the `APPLIER_FACTORIES` entries once each passes.

**Done when:** the parity gate passes for library, notes, actions and prompts with the SDK's library and notes appliers unused, and the dependent-pack fixture passes.

### Phase 4 — Delete the SDK specifics

- Delete the modules in Decision 7 and the `BuiltinRepositories` commands in Decision 8; move the types and shapes to default-setup.
- Make `content/preview.ts` generic: preview items come from the generic applier's records (label from the first identity field, children from the tree), and the keys come from the content index (Decision 11). Remove the closed `PackContentType` union and the default key list, and make the import dialog's `toContentSelection` (default-setup `settings/be/system.ts`) take the keys from the index.
- `api:update` and review the `etc/*.api.md` diffs; update anything importing the moved types (renderer import dialog, host, CLI).
- Run the import-pack-content E2E and `test:packaged-authoring`.

- Add a test that fails when a module under `packages/apack-sdk/src/build` or `src/content` imports or names a library or notes entity type (Document, Collection, Note, their shapes or exported content types), with an explicit allowlist for anything legitimate.

**Done when:** that test passes and is mutation-checked, and the E2E and packaged-authoring runs pass.

### Phase 5 — FAQs and docs

- FAQs through a default-setup compiler module (Decision 9); remove the `faqs` special cases from the generator and compilers, and read `faqs.content.json` in `settings/be/faqs.ts`.
- Docs: a `content.md` in `docs/public-facing` covering object entries, field sources and types, content hooks (owned by the entity type's pack), compiler and applier modules, change-tracking rules per import mode, and the accepted upgrade effects; update default-setup's `CLAUDE.md` and `src/content/CLAUDE.md`, the scaffold template, and the root `CLAUDE.md` content line.

**Done when:** docs describe only the new mechanism and the scaffold's example uses it.

### Phase 6 — Named formats

- Schema: top-level `content.formats` (name → format definition, name `^[a-z][a-z0-9-]*$`) and the Decision 1 entry shape (`{ path, format }` or `{ applier }`); the old inline entry keys are removed. Every Decision 1 validation error has a test. `apack.schema.json`, `api:update`.
- Resolution: one SDK function resolves a pack's `content.sources` against its own `content.formats` and its dependencies' snapshot manifests, used by `buildPackConfigFromManifest`, `compilePack` and `generate-entries` (applier registration options, written keys, entity validation). A dependency format carries where its compiler module loads from (Decision 12).
- Build (Decision 12): `apack build` writes `dist/build/content-compilers.mjs` for packs whose formats name compiler modules; a dependent's build loads dependency compiler modules from it. The CLI passes dependency manifests and build dirs to the bridge.
- Move default-setup's content hooks to `src/content/hooks/` (`features/notes/be/content-hooks.ts` → `notes.ts`, `features/library/be/content-hooks.ts` → `library.ts`) and update `contentWriters` paths, specs and docs.
- Migrate default-setup (`notes`, `library`, `faqs` formats; entries `{ path, format }`), the external fixture pack (a `memos` markdown format and a `quick-memos` compiler format), the dependent-pack fixture (`default-setup:notes` and `default-setup:library`, no field maps or compiler modules), `test:packaged-authoring` (its own compiler format, and `default-setup:notes` through the built dependency), the scaffold template, the parity harness and specs, and the import-pack-content E2E.
- The dependent-pack spec asserts identical rows (including `sourceHash`) to default-setup's own `notes` and `library` entries over the same sources, and that library media and sections come through default-setup's bundled compiler module.
- Docs: `content.md` and `manifest.md` describe `content.formats`, entry references, no overrides, and which pack may define formats versus hooks; default-setup's `CLAUDE.md` and `src/content/CLAUDE.md` (including `hooks/` and `compilers/`).

**Done when:** no in-repo entry carries format settings; default-setup's content hooks and compiler modules live under `src/content/`; the dependent-pack fixture and `test:packaged-authoring` content default-setup's notes and library through `"default-setup:<name>"` with no field maps or compiler modules of their own; the parity gate, dependent-pack spec, external-pack test, import-pack-content E2E and example pack pass; and resolution, the bundled compiler loading and each validation error are mutation-checked.

## Outcome

Recorded after the PR #175 review (the stack collapse onto `AS/generic-content-compiler`), from the code at the branch head and the checks run then. Items the review left open, and the fixes made on the collapsed branch, are listed as such; nothing below claims a check that wasn't run.

### Final summary ("Finished when" item 8)

| Phase | Status | Evidence |
|---|---|---|
| 1 — Spike and parity gate | Done | `default-setup/tests/unit/content-parity/` (goldens first recorded in `7ea8bb8cf`). After the review the v1/v2 fixtures gained an unquoted `title: 2024`, a change two folder levels deep (notes and library) and a `REFERENCES` change, which `notes-change-tracking.spec.ts` checks. The v1/v2 scenarios now content pinned action and prompt fixtures (`tests/fixtures/content-parity/{v1,v2}/{actions,prompts}`), so the goldens move only when applying changes; `default-setup.json` still follows the pack's own sources. |
| 2 — Object entries end to end | Done | `de7a41228`, `477f34ca3`. After the review `apack validate` runs codegen in memory, so it reports a format entity no pack declares, a missing dependency format and a missing `contentWriters` export (`add-feature-validate.spec.ts`; one error at a time, as `build`). Content keys are validated with the `content.formats` name pattern, `format.media` must be a relative path inside the pack, and `markdown-tree` with an entity list is rejected. |
| 3 — Migrate notes, then library | Done | Parity gate and `dependent-pack.spec.ts` pass. |
| 4 — Delete the SDK specifics | Done | `no-pack-content-specifics.spec.ts` passes (and flagged a stray library module name in a comment during the review fixes). A deliberate mutation check of it isn't recorded. |
| 5 — FAQs and docs | Done | `docs/public-facing/content.md`; the FAQ compiler is covered by `faqs-compiler.spec.ts` (added after the review, which also fixed one FAQ's broken frontmatter). |
| 6 — Named formats | Done | `5e78ab687`, `51e675d68`, `17488865a`. After the review `test:packaged-authoring` also content a `default-setup:library` entry, which loads the dependency's bundled `content-compilers.mjs`, and asserts the written rows; a missing `content-compilers.mjs` fails with "build <dependency> first", and compiler-module output is shape-checked. |

Spike answer (Phase 1): notes are expressible with `markdown-tree` plus content hooks; library needs a default-setup compiler module (sections, Collection vs Document) plus hooks, with Collection as a container.

Conventional choices visible in the code:
- Frontmatter is parsed with the `yaml` package.
- A field's `default` applies when the value is missing, `null` or `""` (as the old `title || filename`); `0` and `false` are kept.
- The markdown walker skips only the format's configured `media` folder, and nothing when none is set. Frontmatter may use CRLF line endings and a UTF-8 BOM.
- `wipe-and-replace` removes every row of the entry's configured entity types (`createFormatApplier`'s `entities`), including other packs' and users' rows, as the import dialog states. Media links are rewritten in every text field.
- The import dialog lists only keys the pack registered appliers for, and refuses a pack that isn't installed.
- `apack build` fails before writing the snapshot when the apply-compiler bundle fails.
- Appliers are registered per pack (`registerAppliers(packId, …)`); `contentData` runs only the appliers of the pack the directory's `content.json` names, and `teardownPack` unregisters them.
- Content-writer imports in generated code are named by position.
- The boot apply hash covers every written key's compiled file, `settings` included; `contentPolicy.skipAtBoot` keeps boot applying from resetting settings.
- Applying errors are collected per record in `counts.errors`; boot applying reports them, and Settings → Import pack content shows them.

Checks run at the collapsed branch head (after the review fixes): `npm run typecheck`, `api:check`, `schema:check`, the sdk, default-setup, api, host and cli unit suites, and `npm run test:external-pack` and `npm run test:packaged-authoring` pass. Not run then: the renderer unit suite, the smoke and import-pack-content E2E, and the example pack's `apack test --app-root`.

### Mutation checks

Run during the review fixes; each check failed the named test and was restored:

| Guard | Mutation | Failing test |
|---|---|---|
| Media links stay in the media folders | Remove the lexical containment check, or the realpath check | `applier.spec.ts` "media links that point outside the media folders" |
| Parity pinning | Edit a live default-setup action | Only the `default-setup` parity scenario |
| Notes/record hash skip | Drop the applier's "stored hash matches" skip | Parity scenarios default, replace-on-collision, untracked |
| Content key pattern | Remove the key check | `manifest-schema.spec.ts` |
| Positional content-writer names | Revert to entity-name identifiers | Both content-writer specs in `generate-entries.spec.ts` |
| Empty frontmatter defaults | Apply defaults only to `undefined` | `content-compiler.spec.ts` "gives empty frontmatter values the default" |
| Per-pack appliers | Run every pack's appliers; append instead of replace; drop `unregisterAppliers` from teardown | `content-registry.spec.ts` (2, then 1), `pack-lifecycle.spec.ts` |
| Import errors reach the dialog | Stub the reported errors to `[]` | `library-commands.spec.ts` import-errors test |
| Stale `isolatedDataDir` cleanup | Skip the cleanup | `apack-cli/tests/harness/isolated-data-dir.spec.ts` |
| Import preview lists only importable keys | Drop the registered-key filter; drop the not-installed error | `preview.spec.ts` |
| Configured media folder, CRLF/BOM, entity-list rule, media path rule, empty icon | Revert each | `content-compiler.spec.ts`, `manifest-schema.spec.ts`, `notes-format.spec.ts` |
| `apack validate` Phase 2 errors | Remove the in-memory codegen check | `add-feature-validate.spec.ts` |
| Missing dependency compiler module, bad compiler output | Remove each check | `content-compiler.spec.ts` |
| Build stops on a failed compiler bundle | Restore the old order | `clear-build-output.spec.ts` |
| Wipe types from configuration | Derive them from the records again | `applier.spec.ts` wipe tests |
| Stale references removed on re-apply | Stop `syncReferences` removing links | `notes-change-tracking.spec.ts` |
| Content-writer ownership and rollback | Remove the ownership check, the hook rollback, the artifact rollback | `apack-host/tests/packs/registration.spec.ts` |
| FAQ ordering, heading skip, category string | Remove each | `faqs-compiler.spec.ts` |
| Phase 4 guard | Add `Collection` to a file under `apack-sdk/src/content/` | `no-pack-content-specifics.spec.ts` |
| Parity gate: field mapping | Map the notes format's `title` from `frontmatter.heading` | 6 of 7 `content-parity.spec.ts` scenarios (all but `default-setup`) |
| Content-writer lookup | Skip the entity's `find` hook | `library-commands.spec.ts` (2 tests). The parity gate doesn't catch it: written rows are found by `contentKey` first, so the hook matters only for rows another pack or the user owns |
| Bundled compiler loading (Phase 6) | Move `content-compilers.mjs` aside | `test:packaged-authoring` build fails with "build default-setup first" |

Not recorded: the Constraints' parity-gate mutation for manifest-key routing, and Phase 6's format resolution and per-validation-error mutations. Run them before treating those guards as verified.

## Deferred

- Settings/Secrets as an SDK-internal entity category, not in any facade. Planned separately.
- Entry overrides of a named format (e.g. changing one field of `default-setup:notes`). Not supported: a pack that needs different settings defines its own format. If added later, it's an additive key with objects merged by key (`tree`, `fields` by field name) and scalars, arrays and each field spec replaced.

## Constraints

- Commit as you go in logical chunks, with conventional messages and no Co-Authored-By or Claude-Session lines. Check `git diff --cached` before each commit and commit with `git commit -- <paths>`. Never push or tag.
- Never publish externally: no `npm publish` (use `npm pack` and `--dry-run`), no real GitHub releases. CI workflows may be written, not triggered.
- Never use broad pkill/killall on Electron or node. E2E runs alongside the user's dev and prod apps in the `apack-test` namespace.
- Don't launch the app outside the test environment without isolating `APACK_USER_DATA_DIR`.
- Never run bare tsc on `packages/preload`. Don't run `npm install` in the example pack. Don't edit monorepo version/release metadata.
- The typed EARS types are change-controlled (`packages/apack-sdk/TYPED-EARS.md`). Applier code that needs runtime field names uses the untyped host `qx` or a hook, not a type change.
- Investigate failing tests before changing assertions; mutation-check every new guard or test, the parity gate included (break a field mapping, the notes hash skip, the manifest-key routing and the content-writer lookup, and confirm each fails).
- No backward compatibility: no shims, deprecated fields or fallbacks for the old content format, and no data migrations, adoption rules or hash compatibility for existing rows (Decision 10's accepted upgrade effects). Migrate every in-repo manifest, fixture and template and fix forward.
- Prefer libraries over hand-rolled code (an established YAML/frontmatter parser, since the repo has none; zod for the schema). No polling or hacky workarounds.
- External packs are first-class. Keep the in-repo fixture pack, the example pack (`/Users/spankyed/Develop/Projects/apack-external/example-pack`) and `test:packaged-authoring` passing throughout.
- Manual API boots: `cd packages/api && APACK_ENV=development APACK_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node ../../scripts/with-source.mjs node dist/server.js`.
