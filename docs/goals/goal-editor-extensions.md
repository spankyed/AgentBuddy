# Goal: no first-party `plugin` left in the app

```text
# Goal: no first-party `plugin` left in the app

Implement docs/goals/goal-editor-extensions.md. Follow CLAUDE.md and docs/AGENTS.md.
Read Scope, Decisions, Phases and Constraints before continuing.
The survey was made at 672d70800 on master (2026-10-22); inspect current code before relying on it.

Finished when:
- `extensions.tiptapPlugins` and its whole chain are renamed, every in-repo manifest, pack,
  template, fixture, doc and recorded file migrated in the same change.
- The guard retires the renamed spellings and keeps the three third-party vocabularies.
- `npm run chain` passes.
- Record Outcome, archive this document, repair links and commit closure.

Never find-and-replace over `plugin`: Decision 1 is the boundary, and one side of it reaches a
subprocess argv where a rename typechecks and calls a subcommand that does not exist.
Commit usable checkpoints as you go. Do not expand or reduce scope without user authorization.
```

## Scope

`packages/repo-checks/tests/surface-vocabulary.spec.ts` currently allows `plugin` for three
vocabularies. Two are genuinely somebody else's. The third — the editor one — is **our own
abstraction wearing a borrowed word**, and this goal removes it.

**252 occurrences across 52 files**, measured at `672d70800`:

| Spelling | Count | What it is |
|---|---|---|
| `tiptapPlugins` | 145 | the manifest key `extensions.tiptapPlugins`, and every reader of it |
| `tiptapPluginRegistry` | 29 | the SDK's registry of what packs registered |
| `editorPlugin` | 25 | the local in codegen, `pack-store`, `declaration-binding` |
| `TiptapPlugin` | 19 | the registered shape (`@apackdev/sdk/fe`, published) |
| `TiptapPluginBinding` | 12 | published |
| `TiptapPluginDeclaration` | 8 | published; the manifest entry's type |
| `tiptap-plugins` | 7 | `apack-sdk/src/fe/tiptap-plugins.ts`, which is internal: no exports-map entry, re-exported from `fe/index.ts` |
| `editorPlugins` | 3 | codegen's local |
| `TiptapPluginSchema` | 2 | the zod schema |
| `pluginPopups` | 2 | `TiptapEditor.vue` |

**Why this one is ours.** tiptap has no grouping concept at all. An `extensions.tiptapPlugins` entry is
a name we invented for a bundle of three unrelated things:

```json
"extensions": { "tiptapPlugins": { "suggestions": {
  "extensions": { "referenceSuggestion": "…#ReferenceSuggestion", "commandSuggestion": "…#CommandSuggestion" },
  "popups":     { "references": "…/ReferenceSuggestionPopup.vue" },
  "isSuggestionActive": "…/active-suggestions.ts#isSuggestionActive"
} } }
```

tiptap Extensions, Vue components, and a predicate. Nothing in that is a plugin of anything.

### Out of scope, and why each stays

**ProseMirror's API, which we construct — 150 occurrences across 19 files.** See Decision 1.

**Our bundler plugins — ~79 occurrences.** `packExternalsPlugin`, `hostSharedModulesPlugin`,
`tailwindInjectPlugin`, `opaqueVendorPlugin`, `globWatchPlugin`, `rejectHostImportsPlugin`,
`stubFrontendAssetsPlugin`, `capturedSourcesPlugin`, `keepExternalsBarePlugin`, `importAnalysisPlugin`,
`inputReportPlugin`, `createValidatorPlugin`, `vueSfcPlugin`, `stubSfcPlugin`,
`devPackFrontendsPlugin`, `pluginVue`/`pluginOxlint`/`pluginVitest`, `postcssPlugins`, `inputPlugins`,
`esbuildPlugins`, `VitePlugin`, `pluginContainer`. Each **returns a `vite.Plugin` or an
`esbuild.Plugin`** — the identifier names the interface it implements, which is the one thing a reader
needs from it.

**The Claude Code CLI — ~10 occurrences.** `--plugin-dir`, `pluginDir`, `PluginInfo`, and the argv
`run(['plugin', 'install', …])` (`features/code/be/services/claude-code/`). Another program's
subcommand. A rename here typechecks and then calls a subcommand that does not exist; it has already
happened once on `session/plugins-to-surfaces`.

**Dependency names.** `package.json`, `package-lock.json`: `@vitejs/plugin-vue`, `eslint-plugin-vue`,
`rollup-plugin-dts`, `vite-plugin-static-copy`, `unplugin-vue`, the `@babel/plugin-*` tree.

**`docs/archive` and `CHANGELOG.md`**, as before.

## Decisions

### 1. The boundary is `new Plugin()`: a ProseMirror Plugin keeps the word

**An identifier keeps `plugin` when its referent is an object a third party defines.** That is the rule,
and it is checkable by reading the constructor.

`packages/apack-ui/src/components/tiptap/extensions/` holds both levels side by side:

```ts
// search-extension.ts — the tiptap Extension (ours, outer)
export const SearchAndFind = Extension.create({
  addProseMirrorPlugins() { return [searchPlugin()] },
})

// search-plugin.ts — the ProseMirror Plugin (theirs, inner)
export const searchPluginKey = new PluginKey<SearchPluginState>('search')
export function searchPlugin(): Plugin<SearchPluginState> { return new Plugin<SearchPluginState>({ … }) }
```

So `searchPlugin`, `searchPluginKey`, `SearchPluginState`, `pluginState` (what `PluginKey.getState()`
returns), `commandSuggestionPlugin(Key)`, `referenceSuggestionPlugin(Key)`, `imagePastePlugin`,
`inputRulesPlugin`, `addProseMirrorPlugins`, `registerPlugin` and the four `*-plugin*.ts` filenames all
stay. Renaming `searchPlugin` to `searchExtension` would give one name to two different objects, and
the name is already taken by the Extension in the file beside it.

**This is the one place the goal does not reach "no first-party identifier contains `plugin`".** What it
reaches instead, and what the guard will encode: *every remaining first-party identifier containing
`plugin` names a third-party object it constructs, or a third-party flag it passes.* If that is not
acceptable, the alternative is a wrapper layer renaming ProseMirror's vocabulary at our boundary — new
indirection over 150 call sites, for a word. Say so before Phase 1 rather than after.

### 2. `extensions.editor`, and the inner field keeps `extensions`

| Now | Then |
|---|---|
| `extensions.tiptapPlugins` | `extensions.editor` |
| `TiptapPluginDeclaration` | `EditorExtensionsDeclaration` |
| `TiptapPlugin` | `EditorExtensions` |
| `TiptapPluginBinding` | `EditorExtensionsBinding` |
| `TiptapPluginSchema` | `EditorExtensionsSchema` |
| `tiptapPluginRegistry` | `editorExtensionsRegistry` |
| `editorPlugin` / `editorPlugins` (locals) | `contribution` / `contributions` |
| `fe/tiptap-plugins.ts` | `fe/editor-extensions.ts` |
| `pluginPopups` | `editorPopups` |

The entry's inner `extensions` field is **not** renamed: it holds tiptap Extensions, which is what
tiptap calls them. `extensions.editor.suggestions.extensions` reads as the pack-contribution namespace,
the kind, the group, then tiptap's own word — two different scopes that happen to share a noun.

The alternative is renaming the inner field to `tiptap`, which removes the repetition and names a
library in a manifest key. I would keep `extensions` and take the repetition; it is the accurate one.

`appExtensions` (the sibling key) is untouched.

## Phases

### Phase 1 — the guard moves first

**Deliverable.** A new `editor-concept` group in `surface-vocabulary.spec.ts` holding the ten spellings
in Scope, and the tiptap entries removed from `KEPT` — they stop being a kept vocabulary the moment
Phase 2 lands. Park the scan (an `ALLOWED` entry for the tree) so the group's firing and kept-spelling
cases are live while the rename runs.

Both `KEPT` halves change: `tiptapPlugins`, `TiptapPlugin`, `TiptapPluginBinding`,
`TiptapPluginDeclaration`, `tiptapPluginRegistry` move out; `PluginKey`, `searchPlugin`,
`searchPluginKey`, `SearchPluginState`, `commandSuggestionPluginKey`, `addProseMirrorPlugins`,
`registerPlugin`, `new Plugin` stay and are the case with teeth — they are what Decision 1 rests on.

**Done when:** each of the ten fails the scan when planted alone; every `KEPT` sample passes; the
`FIRES_ON`-style case covers the new group.

### Phase 2 — the manifest key and its chain

**Deliverable.** `extensions.editor` through the schema (`declaration-schema.ts`,
`frontend-declaration.ts`), codegen (`generate-entries.ts`, `module-targets.ts`), the host
(`fe/pack-store.ts`, `fe/declaration-binding.ts`), the SDK (`fe/tiptap-plugins.ts` → `fe/editor-extensions.ts`
and `fe/index.ts`; the module is internal, so no exports map moves), `TiptapEditor.vue`, and the one
in-repo manifest that declares the key: `packages/default-setup/apack.json`. No `tests/packs/*` fixture
declares one, so the fixture suites exercise the rename only through the SDK and host.

No compatibility read of the old key — `CLAUDE.md`'s backward-compatibility rule, and the typecheck
proves the rename finished.

**Done when:** `npm run typecheck`, `npm run build:default-setup`, `npm run test:unit`, and
`npm run test:external-pack` pass. Mutation: a reader left on the old key fails
`fe-registered-lookups.spec.ts` or `declaration-binding`'s validation rather than passing silently.

### Phase 3 — recorded files

**Deliverable.** Four derivations re-taken, each read before committing:

- `npm run schema:update -w @apackdev/sdk` — `apack.schema.json` carries the manifest key.
- `npm run api:update` — `TiptapPlugin*` are published `@apackdev/sdk/fe` entries.
- `npm run facade:update -w @app/default-setup` — `etc/pack-types.api.md`.
- `npm run exports:update -w @apackdev/ui` is **not** needed: the one plugin-named entry in that map,
  `./components/tiptap/extensions/search-plugin`, is a ProseMirror Plugin and stays (Decision 1).

**Done when:** `npm run typecheck` passes with no stale recorded file, and every line of each
regenerated diff is this rename.

### Phase 4 — docs, and the guard goes live

**Deliverable.** `docs/public-facing/{extensions,manifest,architecture}.md` (where a pack author reads
the key), `packages/{apack-sdk,apack-ui,apack-host,renderer,repo-checks}/CLAUDE.md`,
`packages/default-setup/CLAUDE.md`, and root `CLAUDE.md`'s Naming section — which currently names three
vocabularies and must name the two that remain plus Decision 1's rule. Unpark the scan.

**Done when:** the scan is green unparked, `doc-links` passes, and `repo-checks`' guard row describes
what the guard now holds.

## Constraints

- Nothing in `packages/apack-ui/src/components/tiptap/extensions/*-plugin.ts` changes. If a phase wants
  to, re-read Decision 1.
- The pack contract moves: `extensions.editor` is a manifest key, so a pack's `apack.json` changes and
  the facade types change with it. There is no deprecation window.
- `PACK_SNAPSHOT_FORMAT` and `PACK_LAYOUT_VERSION` are not touched. A stale snapshot is refused with an
  enum error at the renamed key, which is the behaviour already.
- Release metadata stays untouched; this is not a version bump.
