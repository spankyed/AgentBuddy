> **Deferred.** Retained for future prioritization; this document does not schedule or authorize
> implementation.

# Goal: a frontend actor is a surface, not a plugin

```text
# Goal: a frontend actor is a surface, not a plugin

Implement docs/goals/goal-plugins-to-surfaces.md. Follow CLAUDE.md and docs/AGENTS.md.
Read Scope, Current handoff, Decisions, Phases and Constraints before continuing.
The survey was made at 507b3b747 on master (2026-10-21); inspect current code before relying on it.

Decision 2 lists the three vocabularies that keep the word `plugin`, one of which is published API
and one of which is stored user data. Read it before any rename. Never run a find-and-replace over
`plugin`.

Finished when:
- Every phase's "Done when" holds on current source, and each new guard is mutation-checked.
- The frontend-actor concept is named `surface` throughout: `Surface`, `SurfaceDeclaration`,
  `useSurface`, `surfaceId`, `features[].surface`, `getRegisteredSurfaces`, `sendToSurface`.
- A guard fails when that concept is named `plugin` again, and passes for Decision 2's three groups.
- What the two `AppState` fields and the two window-storage keys held is still held, proven by a
  migration spec.
- `npm run chain` passes.
- Record Outcome, archive this document, repair links and commit closure.

Commit usable checkpoints as you go. Do not expand or reduce scope without user authorization.
```

## Scope

Rename the frontend-actor concept from `plugin` to `surface`, in code, in the manifest, on the wire, in
stored data and in the docs. Excluded: `pack`, the areas a surface fills (`canvas`, `panel`, `chat`,
`settings`), and the three vocabularies in Decision 2.

Surveyed 2026-10-21 at `507b3b747`.

## Current handoff

Not started. No `surface` identifier exists in `packages/` or `scripts/`; the concept is spelled
`plugin` everywhere. Phase 1 is the next deliverable and depends on nothing.

## Background

**`plugin` names three unrelated things, and collides with a fourth one level up.** Counted over
`packages/`, `scripts/`, `tests/` and `drive/`, excluding Markdown and JSON: **6503 occurrences of 454
distinct identifiers** containing `plugin`. Of those, **300 occurrences of 72 identifiers (4.6%) belong
to another vocabulary** and must not move — tiptap/ProseMirror editor plugins, and Vite/rollup/PostCSS/
esbuild bundler plugins. Including Markdown, the word appears on 5712 tracked lines in 654 files.

The collision one level up is with `pack`: a pack is what a user installs, so a pack is the extension.
Calling a feature's frontend half a "plugin" puts extension vocabulary one level too low.

**What the thing actually is.** A plugin's id is a `FeatureRef` (`<packId>/<featureId>`), so it is the
*frontend half of a feature* — the backend half being its system. It is declared as data in
`apack.json` under `features.<id>.plugin` (`PluginDeclaration`,
`packages/apack-sdk/src/framework/plugin-declaration.ts`), which codegen binds to an XState machine and
components (`Plugin`, `packages/apack-sdk/src/fe/plugin.ts:53`). There is no `definePlugin`: a pack
declares, and the host binds.

**Why `surface`.** It is shown in a window, or popped out into one. It says nothing about containment,
so multiple windows never make it read backwards, and it pairs with `system` — both abstract, neither
implying the other. As an identifier it is free: 86 occurrences in code, all the English verb in prose
("we still want to surface the merge error") plus `surfaceControlRequests` in one Claude Code service
option and `surfaceEdgeError`. One capitalized `Surface`, in a comment.

**Why not `screen` or `view`.** Recorded so they are not reopened.

- `screen`: the platform's hierarchy is screen → window → content (`screen.getAllDisplays()`,
  `window.screen`). A screen contains windows, so "screens in windows" inverts it. This app has
  multiple windows for real — `new BrowserWindow` twice in
  `packages/main/src/modules/window-manager/WindowManager.ts`, with popout wired through the renderer's
  `main.ts`, `App.vue`, `WebApp.vue`, `Toolbar.vue`, `PopoutTitlebar.vue` and
  `ToolbarPluginContextMenu.vue` — and `Screen` is already taken in the opposite sense
  (`SplashScreen`, `modules/splash-screen/`: a thing that *fills* a window).
- `view`: the best English, and occupied — 1334 bare `view` and 96 `View` in code, including
  `PackRegistryView` and `FePackRegistryView`, which are core SDK types.

**What is published.** `@apackdev/sdk` exports **28** entries naming the concept — `Plugin`,
`PluginDeclaration`, `PluginDefinition`, `PluginEvent`, `PluginEvents`, `PluginInbox`,
`PluginInboxAudiences`, `PluginInboxOf`, `PublicPluginInboxOf`, `PluginStateOf`,
`PluginHotkeyDefinition`, `PluginScope`, `PackPluginEntry`, `PackPluginEvents`, `PackPluginState`,
`PackFeaturePlugin`, `HostPluginEvents`, `OwnPluginEvents`, `QualifiedPluginEvents`,
`TypedSendToPlugin`, `usePlugin`, `pluginIsRunning`, `useUntypedPluginState`,
`readUntypedPluginState`, `untypedOpenPlugin`, `untypedBroadcastToPlugin`, `_sendToLocalPlugin`,
`_pluginTargets` — and four that keep the name (Decision 2). `@apackdev/ui`'s plugin-named exports are
all tiptap's; `@apackdev/ears` has none. `apack.schema.json` names `plugin` 19 times and is generated
from `framework/declaration-schema.ts`.

`usePlugin` is pack-facing, so Phase 2 breaks every pack's frontend: in-repo that is default-setup,
`tests/packs/*`, and the CLI's `add feature` scaffold and `init` templates.

**What crosses the wire.** `pluginId` (220 occurrences, plus `pluginIds`, `pendingPluginId`,
`activePluginId` and friends) is stamped on every backend→frontend event, routed on by the renderer,
and validated against `getPluginEventValidationMap()`. The travelling event type names are
`PLUGIN_ACTIVATED`, `PLUGIN_DEACTIVATED`, `PLUGIN_VISIBILITY_UPDATED`, `SET_LAST_ACTIVE_PLUGIN` and
`OPEN_PLUGIN`, with five `eventTypes<T>()` constants pinning them to their contracts:
`PLUGIN_EVENT_TYPES` (`@apackdev/sdk/events`), `HOST_PLUGIN_EVENT_TYPES`,
`APPLICATION_PLUGIN_EVENT_TYPES`, `PACKS_PLUGIN_EVENT_TYPES` and `SETTINGS_PLUGIN_EVENT_TYPES`.

**What is stored.** Four things, in two places (Decision 4):

- `AppState.pluginVisibility` and `AppState.lastActivePlugin`
  (`packages/apack-host/src/app-state/index.ts:51,53`, both named in its attribute list), in the user's
  database.
- The window-storage keys `'code-plugin-open-tabs'`
  (`packages/default-setup/src/features/code/fe/utils/persisted-tabs.ts:18`) and
  `'apack-last-active-plugin'`, which `packages/apack-host/src/fe/migrations/0.4.0.ts` exists to
  remove.

Per-feature settings are keyed by feature (`forFeature`), not by plugin, so there is nothing else.

## Decisions

Final.

1. **The name is `surface`.** `screen` and `view` are rejected for the reasons in Background; do not
   reopen them.

2. **Three vocabularies keep the word `plugin`, because in each it really is one.** A guard allows
   them per pattern, not per file, the way `identity-guard`'s exemptions work.

   **Editor plugins (tiptap/ProseMirror).** The manifest key `frontend.tiptapPlugins`, which sits in
   the same schema as `features.<id>.plugin` — the rename touches one and must not touch its sibling.
   Published: `TiptapPlugin`, `TiptapPluginBinding`, `TiptapPluginDeclaration`, `TiptapPluginSchema`,
   `tiptapPluginRegistry` (`@apackdev/sdk`), and `searchPlugin`, `searchPluginKey`,
   `SearchPluginState` plus the exports-map entry `./components/tiptap/extensions/search-plugin`
   (`@apackdev/ui`) — an entry point, not only a symbol. In sources: `PluginKey`,
   `addProseMirrorPlugins`, `editor.registerPlugin()`, `commandSuggestionPlugin(Key)`,
   `referenceSuggestionPlugin(Key)`, `imagePastePlugin`, `inputRulesPlugin`, `editorPlugins`
   (`generate-entries.ts`), everything under `apack-ui/src/components/tiptap/` and
   `default-setup/src/extensions/tiptap/`, and the filenames `command-suggestion-plugin.ts`,
   `reference-suggestion-plugin.ts`, `reference-plugin-key.ts`, `search-plugin.ts`, `tiptap-plugins.ts`
   — the last beside `plugin-state.ts`, which does rename.

   **Bundler plugins.** `VitePlugin`, `esbuild.Plugin`, `pluginContainer` (Vite's own API), every
   `plugins: [...]` and `plugins.push(...)`, and the repo's own: `packExternalsPlugin`,
   `hostSharedModulesPlugin`, `tailwindInjectPlugin`, `opaqueVendorPlugin`, `inputReportPlugin`,
   `keepExternalsBarePlugin`, `importAnalysisPlugin`, `globWatchPlugin` (`apack-cli/src/build/
   fe-bundler.ts`, `glob-watch.ts`); `rejectHostImportsPlugin`, `stubFrontendAssetsPlugin`,
   `capturedSourcesPlugin` (`be-bundler.ts`); `createValidatorPlugin`
   (`apack-sdk/src/build/compile-utils.ts`); `vueSfcPlugin`, `stubSfcPlugin`
   (`apack-testing/src/vitest.ts`); `devPackFrontendsPlugin`, `postcssPlugin(s)`,
   `tailwindPostcssPlugins` (renderer configs); `pluginVitest`, `pluginOxlint`
   (`renderer/eslint.config.ts`); `collect-bare-imports` (`scripts/lib/published-imports.ts`). Plus
   the dependency names `@vitejs/plugin-vue`, `vite-plugin-vue-devtools`, `vite-plugin-static-copy`,
   `rollup-plugin-dts`, `eslint-plugin-vue`, `eslint-plugin-oxlint`, `@vitest/eslint-plugin`.

   **Stored string literals.** `'code-plugin-open-tabs'` and `'apack-last-active-plugin'` are keys in
   the user's window storage, not identifiers: rename either and the data is orphaned or the migration
   that removes it stops finding it. Phase 4 decides each one; until then they keep their spelling.

   `pack` is not in these groups because it is not this concept: it is the extension unit, one level up.

3. **`pluginId` becomes `surfaceId`, in its own phase.** It is the field everything routes on, and the
   one change that can typecheck and still fail at runtime, so it lands after the type rename with the
   event-validation specs as its proof.

4. **Stored data moves deliberately, and the two kinds move differently.**

   The `AppState` fields need an **app-line migration** (`AppState.pluginVisibility` →
   `surfaceVisibility`, `lastActivePlugin` → `lastActiveSurface`). The host declares none today —
   `packages/apack-host/src/migrations/` holds only `index.ts` — so this creates the first one,
   targeting the next unreleased version, idempotent across a development boot, each beta and a reset
   (`packages/apack-host/src/migrations/CLAUDE.md`).

   The two window-storage keys are the frontend's, and `runFrontendMigrations()` is the precedent.
   `'apack-last-active-plugin'` is already being deleted by `fe/migrations/0.4.0.ts`, so it keeps its
   spelling inside that migration and nowhere else. `'code-plugin-open-tabs'` is live and belongs to
   default-setup's code feature: either keep the literal with a comment saying why, or rename it with a
   frontend migration that moves the value. Decide which; do not rename it bare.

   No backward compatibility beyond these migrations: no dual-read, no old-format fallback, no
   grandfathering.

5. **Event type names move with the concept.** `SURFACE_ACTIVATED`, `SURFACE_DEACTIVATED`,
   `SURFACE_VISIBILITY_UPDATED`, `SET_LAST_ACTIVE_SURFACE`, `OPEN_SURFACE`, and the five
   `*_PLUGIN_EVENT_TYPES` constants. Their `eventTypes<T>()` pins are what prove the rename is complete
   rather than half-applied.

6. **The manifest key becomes `features[].surface`.** It drives codegen, so it moves with the type
   rename in Phase 2, together with `framework/declaration-schema.ts`, the regenerated
   `apack.schema.json`, the CLI scaffold and every in-repo pack.

## Phases

### Phase 1 — write the vocabulary down, and guard it

**Deliverable.** The vocabulary in `CLAUDE.md` and `packages/renderer/CLAUDE.md` — a backend actor is a
**system**, a frontend actor is a **surface**, `plugin` belongs to Decision 2's three groups — and a
guard that holds it.

**The guard lives in `@app/repo-checks`**, modelled on `packages/repo-checks/tests/identity-guard.spec.ts`:
patterns with per-pattern allowances carrying a reason, and a staleness case that fails an entry which
no longer fires. It cannot live in `@apackdev/host`: a suite's project re-runs only when that project's
inputs move, so a guard over the whole repo has to sit in a suite that declares the whole repo
(`SUITE_READS`' `repo`), which `repo-checks`' `fingerprint-scope` and `chain-inputs` enforce.
`identity-guard` learned this by missing a violation in `@apackdev/cli` through two green chain runs.

**Dependencies.** None.

**Done when:** the guard fails for each of `pluginId`, `usePlugin`, `features[].plugin`,
`sendToPlugin`, `getRegisteredPlugins` outside its allowances, and passes for Decision 2's three
groups. Mutation: renaming `TiptapPlugin` fails the allowlist's staleness assertion rather than passing
silently. The guard cannot pass mid-rename, so park it as `it.fails` and flip it in Phase 5, or order
it last in this phase's commits.

### Phase 2 — the concept: types, manifest key, codegen, host, renderer, packs

**Deliverable.** The 28 published SDK entries in Background, their unpublished neighbours
(`PluginFrontendBinding`, `PluginCatalogEntry`, `ShellPluginCatalog`, `SendablePluginEvents`,
`PluginName`, `OwnPluginName`, `DependencyPluginName`, `PluginPane.vue`, `PluginRouter.vue`,
`ToolbarPluginContextMenu.vue` and the rest), the manifest key, codegen, and every caller.

- Manifest: `features[].plugin` → `features[].surface` in `framework/declaration-schema.ts` and
  `plugin-declaration.ts`; regenerate `apack.schema.json` (`npm run schema:update -w @apackdev/sdk`);
  update the CLI's `add feature` scaffold and `init` templates.
- Codegen: `generate-entries` emits `pack-entry-fe.ts` from the new key; `getRegisteredPlugins` →
  `getRegisteredSurfaces`, `registerPackFE`'s registration field, `FePackRegistryView`.
- Renderer: the application actor's surface list, `packPluginIds`, `loadPackFrontend`, the popout query
  and `plugin:popout` IPC (Phase 3 owns those two strings), and the `views/layout` components.
- Every in-repo pack: default-setup and `tests/packs/*`.
- `npm run api:update`.

**Dependencies.** Phase 1's vocabulary; not its guard.

**Done when:** `npm run typecheck`, `npm run api:check`, `npm run schema:check -w @apackdev/sdk`,
`npm run test:unit`, `npm run build:default-setup` and `npm run test:external-pack` pass.
`git grep 'usePlugin\|PluginDeclaration\|features\[\]\.plugin'` finds nothing outside `docs/archive`.

### Phase 3 — the wire: `surfaceId` and the event names

**Deliverable.** `pluginId` → `surfaceId` across the transport, the bus, the renderer's routing, the
registry's validation map (`getPluginEventValidationMap` → `getSurfaceEventValidationMap`) and
generated events; Decision 5's event names with their pins updated. The three internal strings go here
too, each with its consumer in the same commit: `'plugin:popout'` and `?popout=plugin&pluginId=`
(`main/WindowManager.ts:144`, `preload/src/index.ts:35`), `data-active-plugin`
(`renderer/src/views/WebApp.vue`, read by `apack-testing/src/index.ts:342`), and `'plugin-send'`
(`api/src/transport/emitter.ts:64`).

Keep the standing warning in `CLAUDE.md` under its new name: never use `surfaceId` as a field inside an
event payload, since the transport stamps it.

**Dependencies.** Phase 2's type names.

**Done when:** `npm test -w @apackdev/host` passes, including `tests/bus/outgoing-events.spec.ts` and
`tests/packs/event-validation-map.spec.ts`; `npm run test:unit` and `npm run test:e2e -- smoke` pass.
Mutation: one `pluginId` left in the renderer's routing fails an event-validation or smoke spec rather
than passing silently — if it does not, add the spec that catches it.

### Phase 4 — stored identities

**Deliverable.** Decision 4, implemented: the app-line migration for the two `AppState` fields with
their owned consumers, fixtures and tests; and the chosen treatment of each window-storage key.

**Dependencies.** Phase 2's `AppState` consumers.

**Done when:** a migration spec proves a database written before the change reads back the same
visibility map and last-active ref under the new field names; current-format backup, import and reset
keep their behaviour; `npm test -w @apackdev/host` and `npm run test:unit` pass.

### Phase 5 — docs, and turn the guard on

**Deliverable.** `CLAUDE.md`, `packages/renderer/CLAUDE.md`, `packages/apack-sdk/CLAUDE.md`,
`packages/apack-host/CLAUDE.md`, `packages/apack-cli/CLAUDE.md`, `packages/apack-ui/CLAUDE.md`,
`packages/default-setup/CLAUDE.md`, `tests/e2e/CLAUDE.md`, and `docs/public-facing/` (`architecture.md`,
`manifest.md`, `extensions.md`, `cli.md`, `testing.md`, `content.md`). Flip Phase 1's guard live.

**Dependencies.** Phases 2–4.

**Done when:** `npm run chain` passes, and the guard reports only Decision 2's groups and
`docs/archive`.

## Deferred

- **Renaming `pack`**, the extension unit: this goal is the level below it.
- **Renaming `canvas`, `panel`, `chat`, `settings`**: they are the areas a surface fills and read
  correctly already.
- **`docs/archive`**: archived documents record the vocabulary of their time and are not checked
  against the code.

## Constraints

Standing repository rules apply as written (`CLAUDE.md`, `docs/AGENTS.md`): no backward-compat shims,
commits only on request, the chain as the gate. Goal-specific:

- **Never find-and-replace over `plugin`.** Decision 2 lists three vocabularies that keep it; one is
  published API and one is stored user data.
- Published packages: no `any`, the TypeScript floor, `npm run api:update` after export changes — Phase
  2 renames 28 public entries and must update `etc/*.api.md`.
- Typed EARS types are change-controlled (`packages/apack-sdk/TYPED-EARS.md`). This goal renames a
  frontend concept and must not touch them; `AppState` is the host's entity, and Phase 4 touches its
  fields rather than that contract.
- Phase 4's migration targets the next unreleased version and is not a version bump; release metadata
  stays untouched.
