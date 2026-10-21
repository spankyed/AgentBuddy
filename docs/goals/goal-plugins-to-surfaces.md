# Goal: rename the frontend plugin to a surface

```text
# Goal: rename the frontend plugin to a surface

Implement docs/goals/goal-plugins-to-surfaces.md. Follow CLAUDE.md and docs/AGENTS.md.
Read Scope, Current handoff, What keeps the name, Phases and Constraints before continuing.
The survey was made at 507b3b747 on master (2026-10-21); inspect current code before relying on it.

Never find-and-replace over `plugin`. "What keeps the name" lists what must not move: editor
plugins, bundler plugins and two stored string literals. One is published API; one is user data.

Finished when:
- Every phase's "Done when" holds on current source, and each new guard is mutation-checked.
- The concept is named `surface` throughout: `Surface`, `SurfaceDeclaration`, `useSurface`,
  `surfaceId`, `features[].surface`, `getRegisteredSurfaces`, `sendToSurface`.
- A guard fails when it is named `plugin` again, and passes for what keeps the name.
- What the two `AppState` fields and the two window-storage keys held is still held, proven by a
  migration spec.
- `npm run chain` passes.
- Record Outcome, archive this document, repair links and commit closure.

Commit usable checkpoints as you go. Do not expand or reduce scope without user authorization.
```

## Scope

A feature's frontend half is a **surface**; its backend half stays a **system**. Rename the concept in
code, in the manifest, on the wire, in stored data and in the docs.

Excluded: `pack`; the areas a surface fills (`canvas`, `panel`, `chat`, `settings`); and everything
under "What keeps the name".

Surveyed 2026-10-21 at `507b3b747`.

## Current handoff

**Active, unstarted.** On `master`; nothing implemented. Phase 1 is the next deliverable and depends
on nothing.

**One thing to settle in Phase 2, not during it.** `PROVENANCE_KINDS.plugins` (`build/manifest.ts:162`)
is a snapshot key a dependent pack reads, and `packages/apack-sdk/CLAUDE.md` says to bump
`PACK_SNAPSHOT_FORMAT` for any change to what a dependent reads from a snapshot that another CLI would
misread. There is one CLI and every pack is in this tree, rebuilt together, so a bump guards against
nothing here — but the rule says otherwise, so do not bump it quietly either way.

## What this touches

**6503 occurrences of 454 distinct identifiers** containing `plugin`, over `packages/`, `scripts/`,
`tests/` and `drive/`, excluding Markdown and JSON. 300 occurrences of 72 identifiers keep the name;
the other 6203 move. Including Markdown, the word is on 5712 tracked lines in 654 files.

**The manifest and codegen.** A surface is declared as data under `features.<id>.plugin`
(`PluginDeclaration`, `packages/apack-sdk/src/framework/plugin-declaration.ts`), which codegen binds to
a machine and components (`Plugin`, `packages/apack-sdk/src/fe/plugin.ts:53`). There is no
`definePlugin`. `apack.schema.json` names `plugin` 19 times and is generated from
`framework/declaration-schema.ts`.

**28 published `@apackdev/sdk` entries**: `Plugin`, `PluginDeclaration`, `PluginDefinition`,
`PluginEvent`, `PluginEvents`, `PluginInbox`, `PluginInboxAudiences`, `PluginInboxOf`,
`PublicPluginInboxOf`, `PluginStateOf`, `PluginHotkeyDefinition`, `PluginScope`, `PackPluginEntry`,
`PackPluginEvents`, `PackPluginState`, `PackFeaturePlugin`, `HostPluginEvents`, `OwnPluginEvents`,
`QualifiedPluginEvents`, `TypedSendToPlugin`, `usePlugin`, `pluginIsRunning`, `useUntypedPluginState`,
`readUntypedPluginState`, `untypedOpenPlugin`, `untypedBroadcastToPlugin`, `_sendToLocalPlugin`,
`_pluginTargets`. `@apackdev/ui`'s plugin-named exports are all tiptap's; `@apackdev/ears` has none.
`usePlugin` is pack-facing, so this breaks default-setup, `tests/packs/*` and the CLI's `add feature`
scaffold and `init` templates.

**`@apackdev/testing` is pack-facing too**, and has no `etc/` report to catch it: `app.navigate(pluginId)`
and `app.waitForPlugin(pluginId)` are what every pack's E2E suite calls, documented in
`packages/apack-testing/CLAUDE.md`, `tests/e2e/CLAUDE.md` and `docs/public-facing/testing.md`, and
`__PLUGIN_ID__` is the placeholder `apack pack init-tests` scaffolds into a pack's smoke spec.

**16 of default-setup's content sources send to a plugin** (`src/content/actions/**`,
`services.emitter.broadcastToPlugin('default-setup/threads', …)`). Their text is compiled by
`apack pack build`, so renaming the send moves each one's `contentHash` and the run needs
`npm run content-parity:update -w @app/default-setup`.

**The wire.** `pluginId` (220 occurrences, plus `pluginIds`, `pendingPluginId`, `activePluginId`) is
stamped on every backend→frontend event, routed on by the renderer, and validated against
`getPluginEventValidationMap()`. **22 event names travel**: `OPEN_PLUGIN`, `SEND_TO_PLUGIN`,
`SELECT_PLUGIN`, `SELECT_PLUGIN_BY_SHELL`, `SET_PLUGIN_VISIBILITY`, `PLUGIN_VISIBILITY_UPDATED`,
`PLUGIN_ACTIVATED`, `PLUGIN_DEACTIVATED`, `PLUGIN_PICKED`, `PLUGIN_DECLARATIONS_CHANGED`,
`PACK_PLUGINS_UNLOADED`, `REQUEST_PLUGIN_DATA`, `RECEIVE_PLUGIN_DATA`, `DELIVER_PLUGIN_EVENTS`,
`SET_LAST_ACTIVE_PLUGIN`, `TRAIL_NEW_PLUGIN`, `SWITCH_PLUGIN_UP`, `SWITCH_PLUGIN_DOWN`,
`OPEN_PLUGIN_FROM_APP`, `APP_OPEN_PLUGIN_HELP`, `APP_POPOUT_PLUGIN`, and the scaffold placeholder
`__PLUGIN_ID__`. Five `eventTypes<T>()` constants pin them to their contracts: `PLUGIN_EVENT_TYPES`
(`@apackdev/sdk/events`), `HOST_PLUGIN_EVENT_TYPES`, `APPLICATION_PLUGIN_EVENT_TYPES`,
`PACKS_PLUGIN_EVENT_TYPES` and `SETTINGS_PLUGIN_EVENT_TYPES`.

No pack rule changes: `reserved-event-keys` guards `_call` alone, and no rule key names `plugin`.

**Stored data**, which moves by migration and not by rename (Phase 4):

- `AppState.pluginVisibility` and `AppState.lastActivePlugin`
  (`packages/apack-host/src/app-state/index.ts:51,53`, both named in its attribute list).
- The window-storage keys `'code-plugin-open-tabs'`
  (`packages/default-setup/src/features/code/fe/utils/persisted-tabs.ts:18`) and
  `'apack-last-active-plugin'`, which `packages/apack-host/src/fe/migrations/0.4.0.ts` exists to remove.

Per-feature settings are keyed by feature (`forFeature`), so there is nothing else stored.

## What keeps the name

Allowed per pattern, not per file, the way `identity-guard`'s exemptions work.

**Editor plugins (tiptap/ProseMirror).** The manifest key `frontend.tiptapPlugins`, which sits in the
same schema as `features.<id>.plugin`. Published: `TiptapPlugin`, `TiptapPluginBinding`,
`TiptapPluginDeclaration`, `TiptapPluginSchema`, `tiptapPluginRegistry` (`@apackdev/sdk`), and
`searchPlugin`, `searchPluginKey`, `SearchPluginState` plus the exports-map entry
`./components/tiptap/extensions/search-plugin` (`@apackdev/ui`) — an entry point, not only a symbol. In
sources: `PluginKey`, `addProseMirrorPlugins`, `editor.registerPlugin()`,
`commandSuggestionPlugin(Key)`, `referenceSuggestionPlugin(Key)`, `imagePastePlugin`,
`inputRulesPlugin`, `editorPlugins` (`generate-entries.ts`), everything under
`apack-ui/src/components/tiptap/` and `default-setup/src/extensions/tiptap/`, and the filenames
`command-suggestion-plugin.ts`, `reference-suggestion-plugin.ts`, `reference-plugin-key.ts`,
`search-plugin.ts`, `tiptap-plugins.ts` — the last beside `plugin-state.ts`, which does rename.

**Bundler plugins.** `VitePlugin`, `esbuild.Plugin`, `pluginContainer` (Vite's own API), every
`plugins: [...]` and `plugins.push(...)`, and the repo's own: `packExternalsPlugin`,
`hostSharedModulesPlugin`, `tailwindInjectPlugin`, `opaqueVendorPlugin`, `inputReportPlugin`,
`keepExternalsBarePlugin`, `importAnalysisPlugin`, `globWatchPlugin` (`apack-cli/src/build/fe-bundler.ts`,
`glob-watch.ts`); `rejectHostImportsPlugin`, `stubFrontendAssetsPlugin`, `capturedSourcesPlugin`
(`be-bundler.ts`); `createValidatorPlugin` (`apack-sdk/src/build/compile-utils.ts`); `vueSfcPlugin`,
`stubSfcPlugin` (`apack-testing/src/vitest.ts`); `devPackFrontendsPlugin`, `postcssPlugin(s)`,
`tailwindPostcssPlugins` (renderer configs); `pluginVitest`, `pluginOxlint`
(`renderer/eslint.config.ts`); `collect-bare-imports` (`scripts/lib/published-imports.ts`). Plus the
dependency names `@vitejs/plugin-vue`, `vite-plugin-vue-devtools`, `vite-plugin-static-copy`,
`rollup-plugin-dts`, `eslint-plugin-vue`, `eslint-plugin-oxlint`, `@vitest/eslint-plugin`.

**Two stored string literals.** `'code-plugin-open-tabs'` and `'apack-last-active-plugin'` are keys in
the user's window storage, not identifiers: rename either and the data is orphaned or the migration
that removes it stops finding it. Phase 4 decides each; until then they keep their spelling.

## What the user sees

The word is in the product, not only the code, and it goes too — nothing is left saying `plugin`.

- `WebApp.vue:146` — the context-menu item `'Pop Out Plugin'`.
- `CanvasArea.vue:27` and `PopoutTitlebar.vue:22` — `title="Plugin menu"`.
- `Hotkeys.vue:19,28` — the settings labels `"Previous Plugin"` / `"Next Plugin"`, and the ids
  `switch-plugin-up` / `switch-plugin-down`.
- `PackDetail.vue:239` — a feature's `plugin` badge, sitting beside its `system` one.
- `Toolbar.vue:15,36` — `data-onboarding-id="plugin-<id>"`, the selector
  `packages/renderer/tests/views/layout/toolbar.spec.ts:26` queries buttons by.
- `packages/default-setup/src/content/notes/welcome.md:29,30,32,62` — the first thing a new user
  reads: "switch between plugins", "the active plugin" twice, "the Brain plugin". **Content**, so the
  edit moves its `contentHash` and the run needs `content-parity:update`.

## Phases

### Phase 1 — write the vocabulary down, and guard it

**Deliverable.** The vocabulary in `CLAUDE.md` and `packages/renderer/CLAUDE.md` — a backend actor is a
system, a frontend actor is a surface, `plugin` belongs to the groups above — and a guard that holds it.

The guard lives in `@app/repo-checks`, modelled on `packages/repo-checks/tests/identity-guard.spec.ts`:
patterns with per-pattern allowances carrying a reason, and a staleness case that fails an entry which
no longer fires. It cannot live in `@apackdev/host` — a guard over the whole repo has to sit in a suite
that declares the whole repo (`SUITE_READS`' `repo`), which `repo-checks`' `fingerprint-scope` and
`chain-inputs` enforce.

**Dependencies.** None.

**Done when:** the guard fails for each of `pluginId`, `usePlugin`, `features[].plugin`,
`sendToPlugin`, `getRegisteredPlugins` outside its allowances, and passes for the three groups above.
Mutation: renaming `TiptapPlugin` fails the allowlist's staleness assertion rather than passing
silently. The guard cannot pass mid-rename, so park it as `it.fails` and flip it in Phase 5, or order
it last in this phase's commits.

### Phase 2 — the concept: types, manifest key, codegen, host, renderer, packs

**Deliverable.** The 28 published entries above, their unpublished neighbours
(`PluginFrontendBinding`, `PluginCatalogEntry`, `ShellPluginCatalog`, `SendablePluginEvents`,
`PluginName`, `OwnPluginName`, `DependencyPluginName`, `PluginPane.vue`, `PluginRouter.vue`,
`ToolbarPluginContextMenu.vue` and the rest), the manifest key, codegen, and every caller.

- Manifest: `features[].plugin` → `features[].surface` in `framework/declaration-schema.ts` and
  `plugin-declaration.ts`; regenerate `apack.schema.json` (`npm run schema:update -w @apackdev/sdk`);
  update the CLI's `add feature` scaffold and `init` templates.
- Codegen: `generate-entries` emits `pack-entry-fe.ts` from the new key; `getRegisteredPlugins` →
  `getRegisteredSurfaces`, `registerPackFE`'s registration field, `FePackRegistryView`.
- Renderer: the application actor's surface list, `packPluginIds`, `loadPackFrontend`, and the
  `views/layout` components. Phase 3 owns the popout query and `plugin:popout` IPC.
- Every in-repo pack: default-setup and `tests/packs/*`; `@apackdev/testing`'s driver and the
  `init-tests` scaffold.
- `npm run api:update`, `npm run facade:update -w @app/default-setup` (its `etc/pack-types.api.md`
  names the concept throughout), and `npm run content-parity:update -w @app/default-setup` for the 16
  action sources.

**Dependencies.** Phase 1's vocabulary; not its guard.

**Done when:** `npm run typecheck`, `npm run api:check`, `npm run schema:check -w @apackdev/sdk`,
`npm run test:unit`, `npm run build:default-setup` and `npm run test:external-pack` pass.
`git grep 'usePlugin\|PluginDeclaration\|features\[\]\.plugin'` finds nothing outside `docs/archive`.

### Phase 3 — the wire: `surfaceId` and the event names

**Deliverable.** `pluginId` → `surfaceId` across the transport, the bus, the renderer's routing, the
registry's validation map (`getPluginEventValidationMap` → `getSurfaceEventValidationMap`) and
generated events. `SURFACE_ACTIVATED`, `SURFACE_DEACTIVATED`, `SURFACE_VISIBILITY_UPDATED`,
`SET_LAST_ACTIVE_SURFACE`, `OPEN_SURFACE` and the five `*_PLUGIN_EVENT_TYPES` constants, with their
`eventTypes<T>()` pins updated.

Three internal strings go here too, each with its consumer in the same commit: `'plugin:popout'` and
`?popout=plugin&pluginId=` (`main/WindowManager.ts:144`, `preload/src/index.ts:35`),
`data-active-plugin` (`renderer/src/views/WebApp.vue`, read by `apack-testing/src/index.ts:342`), and
`'plugin-send'` (`api/src/transport/emitter.ts:64`).

Keep the standing warning in `CLAUDE.md` under its new name: never use `surfaceId` as a field inside an
event payload, since the transport stamps it.

**Dependencies.** Phase 2's type names. Separate from Phase 2 because it is the one change that can
typecheck and still fail at runtime.

**Done when:** `npm test -w @apackdev/host` passes, including `tests/bus/outgoing-events.spec.ts` and
`tests/packs/event-validation-map.spec.ts`; `npm run test:unit` and `npm run test:e2e -- smoke` pass.
Mutation: one `pluginId` left in the renderer's routing fails an event-validation or smoke spec rather
than passing silently — if it does not, add the spec that catches it.

### Phase 4 — stored identities

**Deliverable.** `AppState.pluginVisibility` → `surfaceVisibility` and `lastActivePlugin` →
`lastActiveSurface`, with their consumers, fixtures and tests, behind an **app-line migration**. The
host declares none today (`packages/apack-host/src/migrations/` holds only `index.ts`), so this creates
the first one: target the next unreleased version, idempotent across a development boot, each beta and
a reset (`packages/apack-host/src/migrations/CLAUDE.md`).

The two window-storage keys are the frontend's, and `runFrontendMigrations()` is the precedent.
`'apack-last-active-plugin'` keeps its spelling inside `fe/migrations/0.4.0.ts` and nowhere else.
`'code-plugin-open-tabs'` is live: either keep the literal with a comment saying why, or rename it with
a frontend migration that moves the value. Decide which; do not rename it bare.

No backward compatibility beyond these migrations: no dual-read, no old-format fallback, no
grandfathering.

**Dependencies.** Phase 2's `AppState` consumers.

**Done when:** a migration spec proves a database written before the change reads back the same
visibility map and last-active ref under the new field names; current-format backup, import and reset
keep their behaviour; `npm test -w @apackdev/host` and `npm run test:unit` pass.

### Phase 5 — docs, and turn the guard on

**Deliverable.** Every tracked Markdown outside `docs/archive` that names the concept, which is what
the guard reports rather than a list to keep in step: **14 `CLAUDE.md` files** (186 lines, the biggest
being `packages/default-setup/`, the root, `tests/e2e/`, `packages/apack-host/` and
`packages/renderer/`) and **24 files under `docs/` (269 lines)** — all nine of `docs/public-facing/`,
four under `docs/references/`, four plans, two issues and the sibling goals. Everything under "What the
user sees". Flip Phase 1's guard live.

**Dependencies.** Phases 2–4.

**Done when:** `npm run chain` passes — which includes `content-parity:check` over the re-recorded
`welcome.md` — and the guard reports only the groups above and `docs/archive`.

### Phase 6 — the prose pass

**Deliverable.** A read, not a replace. The guard can only find the word; what it cannot find is a
sentence that has gone wrong because the noun moved. **4774 lines of source name the concept**, most of
them comments, and this repo comments heavily: a comment explaining why a plugin cannot answer a
by-ref send, or what a pane belongs to, often needs rewriting rather than substituting. Read every file
the rename touched and fix what now reads wrong, including each guide's prose.

Also the agent memory at
`~/.claude/projects/-Users-spankyed-Develop-Projects-AgentBuddy/memory/`, which no guard can see
because it is outside the repo. Four files name something this goal retires:
`feedback_no_mirror_or_text_tests.md` and `feedback_no_silent_design_calls.md` use `sendToPlugin` and
`usePlugin` as their worked examples, `feedback_prefer_flows_over_systems.md` says "its own frontend
plugin", and `hermes-integration.md` names `packages/renderer/src/plugins/hermes/` and
`packages/api/src/systems/hermes/` — **already stale, both paths gone, independent of this goal.**
Update `MEMORY.md`'s pointers with them. `launch-film-edit-system.md` is a separate project's
vocabulary; leave it.

**Dependencies.** Phase 5.

**Done when:** `npm run chain` passes, no comment or guide sentence describes a surface as a plugin,
and the four memory files name current symbols and paths.

## Deferred

- Renaming `pack`, the extension unit: this goal is the level below it.
- Renaming `canvas`, `panel`, `chat`, `settings`: the areas a surface fills.
- `docs/archive`, which records the vocabulary of its time and is not checked against the code.

## Constraints

Standing repository rules apply as written (`CLAUDE.md`, `docs/AGENTS.md`): no backward-compat shims,
commits only on request, the chain as the gate. Goal-specific:

- **Never find-and-replace over `plugin`.** See "What keeps the name".
- Published packages: no `any`, the TypeScript floor, `npm run api:update` after export changes — Phase
  2 renames 28 public entries and must update `etc/*.api.md`.
- Typed EARS types are change-controlled (`packages/apack-sdk/TYPED-EARS.md`) and this goal must not
  touch them; `AppState` is the host's entity, and Phase 4 touches its fields, not that contract.
- Phase 4's migration targets the next unreleased version and is not a version bump; release metadata
  stays untouched.
