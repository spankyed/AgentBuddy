# Goal: a frontend actor is a surface, not a plugin

> **Written in session** `36f122d9-3a1e-40ef-988d-40b2574fc098` (Claude Code, 2026-09-26). Resume it with `claude -r 36f122d9-3a1e-40ef-988d-40b2574fc098`.

```
# Goal: a frontend actor is a surface, not a plugin

Implement docs/goals/goal-plugins-to-surfaces.md on a branch cut from master.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. Decision 2 lists what keeps the name `plugin` — read it before any
rename, and never run a blind find-and-replace over `plugin`.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations, and Phase 4 is that exception.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- The frontend actor concept is named `surface` throughout: `Surface`, `defineSurface`, `useSurface`,
  `SurfaceDefinition`, `surfaceId`, `features[].surface`, `getRegisteredSurfaces`, `sendToSurface`.
- `grep -rIn '\bplugin' packages/ scripts/ docs/ --exclude-dir=node_modules --exclude-dir=dist` returns
  only the names Decision 2 keeps (tiptap/ProseMirror, Vite/rollup/PostCSS) and `docs/archive`.
- A guard fails when the frontend-actor concept is named `plugin` again, and passes for the kept names.
- `AppState.surfaceVisibility` and `AppState.lastActiveSurface` hold what the old fields held, for a
  data dir written before this change, proven by a migration spec.
- npm run typecheck; npm run api:check; npm run schema:check; npm run test:unit;
  npm run compile; npm run test:external-pack; npm test.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Never:
- commit, stage, push or tag unless the user asks in this session. When asked, commit in logical
  chunks (conventional messages, no Co-Authored-By or session lines) with `git commit -- <paths>`,
  and check `git diff --cached` first: something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- rename a tiptap/ProseMirror or Vite/rollup/PostCSS plugin (Decision 2), or rename `pack` — a pack is
  the extension unit and is not what this goal touches.
- rename `AppState` fields without the migration in Phase 4: those are stored user data.
```

## Background (2026-09-26, at `8b9d62114`)

**`plugin` names three unrelated things.** Counted across `packages/`, `docs/`, `scripts/` and `tests/`,
excluding `node_modules` and `dist`: **6050** case-insensitive references to `plugin`. They split into

- the frontend actor concept — the thing this goal renames;
- **77** references to tiptap/ProseMirror plugins (`TiptapPlugin`, `tiptapPluginRegistry`), which are
  genuinely plugins of the editor;
- Vite, rollup and PostCSS plugins in build configs, which are genuinely plugins of the bundler.

It also collides with the idea one level up: a **pack** is what a user installs, so a pack is the
extension. Naming a frontend actor a "plugin" puts the extension vocabulary on the wrong level.

**What the thing actually is.** `Plugin.id` is a `FeatureRef` (`<packId>/<featureId>`), so a frontend
plugin is the *frontend half of a feature* — the backend half being its system. It owns an XState
machine and fills named areas:

```ts
export interface Plugin {
  id: FeatureRef;      // `<packId>/<featureId>`, the host's own under `host`
  label: string;
  isPinned?: boolean;
  state: AnyStateMachine;
  icon?: Component;
  canvas?: Component | RouteComponents;
  panel?: Component;
  fallbackPanel?: { label: string; isShown(…): boolean; toggle: { type: string } };
  chat?: Component;
  settings?: Component;
  hotkeys?: PluginHotkeyDefinition[];
  options?: { headerClass?: string };
}
```

**Why not `screen`.** It was the first candidate and it is wrong here, recorded so it isn't reopened:

- The platform's own hierarchy is screen → window → content (`screen.getAllDisplays()` in Electron,
  `window.screen` on the web). A screen contains windows. "Screens in windows" inverts it.
- This app has multiple windows for real: `new BrowserWindow` twice in
  `packages/main/src/modules/window-manager/WindowManager.ts`, and popout is wired through
  `renderer/src/main.ts`, `views/App.vue`, `views/WebApp.vue`, `views/layout/Toolbar.vue`,
  `PopoutTitlebar.vue` and `ToolbarPluginContextMenu.vue`. A destination gets its own window today.
- `Screen` is already taken in the opposite sense: `SplashScreen`, `createSplashScreen`,
  `modules/splash-screen/` — a thing that *fills* a window.

`view` is the best English and has precedent, but it is occupied: 383 bare `view` plus 44 `View`,
including `PackRegistryView` and `FePackRegistryView`, which are core SDK types. `surface` is free in
practice — its 26 hits are the English verb ("we still want to surface the merge error") plus
`surfaceControlRequests` in one Claude Code service. No type, no identifier, nothing structural.

**What is stored, and therefore not a code rename.** `AppState` (`packages/abuddy-host/src/app-state/index.ts`)
holds two fields naming the concept, in the user's database:

```ts
/** The plugins whose sidebar tab the user showed or hid, by ref. */
pluginVisibility: Record<string, boolean>;
/** The plugin the user last had open, by ref; a window opens on it once it connects */
lastActivePlugin?: string;
```

There is a working precedent for the frontend half of this:
`packages/abuddy-host/src/fe/migrations/0.3.15.ts` already removed a `localStorage` key
(`agentbuddy-last-active-plugin`) when that state moved host-side. `runFrontendMigrations()` runs
localStorage migrations before the actor reads its keys.

**What crosses the wire.** `sendToPlugin` stamps `pluginId` onto every backend→frontend event, the
renderer routes on it, and the bus validates against `getPluginEventValidationMap()`. There are **294**
`pluginId` references under `packages/`. The event type names that travel are `PLUGIN_ACTIVATED` (10),
`PLUGIN_VISIBILITY_UPDATED` (5), `SET_LAST_ACTIVE_PLUGIN` (5), `PLUGIN_DEACTIVATED` (3), and the
`*_PLUGIN_EVENT_TYPES` constants (5): `HOST_PLUGIN_EVENT_TYPES` is pinned to `HostPluginEvents` by a
compile-time check, and `PACKS_PLUGIN_EVENT_TYPES` to `OutgoingPacksEvents`.

**What is published API.** The SDK's reports name, among others, `PluginDefinition`, `PluginEvent`,
`PluginEvents`, `PluginInbox`, `PluginInboxAudiences`, `PluginHotkeyDefinition`, `PluginScope`,
`PackPluginEntry`, `PackFeaturePlugin`, `HostPluginEvents`, `definePlugin`, `usePlugin`,
`pluginIsRunning`, `useUntypedPluginState`, `readUntypedPluginState`, `untypedOpenPlugin`,
`untypedBroadcastToPlugin`, `_sendToLocalPlugin` — and, not to be touched, `TiptapPlugin` and
`tiptapPluginRegistry`. `definePlugin` and `usePlugin` are pack-facing, so this breaks every pack's
frontend code; in the repo that is default-setup, `tests/fixtures/*` and the CLI's `add feature`
scaffold. `abuddy.schema.json` names `plugin` 8 times and is generated from `manifest-schema.ts`. Six
files under `docs/public-facing/` mention it.

## Decisions

Final.

1. **The name is `surface`.** A surface is shown in a window, or popped out into one, which is the right
   way round; it says nothing about containment, so multiple windows never make it read backwards. It
   pairs with `system` — both abstract, neither implying the other. `screen` and `view` are rejected for
   the reasons in Background; do not reopen them.

2. **What keeps the name `plugin`, because it really is one.** Rename nothing in these groups:
   - tiptap/ProseMirror: `TiptapPlugin`, `tiptapPluginRegistry`, `tiptapPlugins` in a pack's frontend
     registration, and anything under `abuddy-ui/src/components/tiptap/`;
   - Vite, rollup and PostCSS: `VitePlugin`, `plugins: [...]` in any config, `packExternalsPlugin`,
     `builtInPacksPlugin`, `hostDepsPlugin`, `tailwindInjectPlugin`, `rejectHostImportsPlugin`,
     `stubFrontendAssetsPlugin`, `collect-bare-imports`;
   - `pack`, which is the extension unit and is not this concept;
   - **already-shipped migrations and their specs**, which describe a state of the world that was.
     `packages/abuddy-host/src/migrations/app/0.3.15.ts` holds `addressPluginKeys`, `pluginRefOf`,
     `movePluginSettings`, `PluginOwners` and reads a stored `lastActivePlugin`; its specs are
     `tests/migrations/plugin-keys-0.3.15.spec.ts` and `plugin-settings-0.3.15.spec.ts`. Renaming them
     would make them describe a move that never happened under those names. They stay, and the guard
     allows them the way `removed-names-in-docs.spec.ts` allows `docs/archive`.

   A blind find-and-replace over `plugin` breaks all four. Phase 1's guard is what keeps the boundary
   after the rename, since the two vocabularies now live side by side on purpose.

3. **`pluginId` becomes `surfaceId`, in its own phase.** It is the field everything routes on — the
   transport stamps it, the renderer routes on it, the bus validates against it, and generated
   `#generated/events` carries it into every pack. Renaming it is consistent and there is no external
   consumer to break, but it is the one change that can fail at runtime while typechecking, so it lands
   separately from the type rename with the event-validation specs as its proof.

4. **The `AppState` fields move with a host migration, not a rename.** `pluginVisibility` and
   `lastActivePlugin` are in the user's database. Add a migration under
   `packages/abuddy-host/src/migrations/app/` targeting the next unreleased version — append to the
   latest target file rather than creating a new one, and guard it so it is idempotent across a
   development boot, each beta and a reset (`packages/abuddy-host/src/migrations/CLAUDE.md`).

5. **Event type names move with the concept.** `PLUGIN_ACTIVATED`, `PLUGIN_DEACTIVATED`,
   `PLUGIN_VISIBILITY_UPDATED`, `SET_LAST_ACTIVE_PLUGIN` and the `*_PLUGIN_EVENT_TYPES` constants
   become `SURFACE_*` / `SET_LAST_ACTIVE_SURFACE`. Their compile-time pins (`HostPluginEvents`,
   `OutgoingPacksEvents`) are what prove the rename is complete rather than half-applied.

6. **The manifest key becomes `features[].surface`.** It drives codegen, so it moves with the type
   rename in Phase 2, together with `manifest-schema.ts`, the regenerated `abuddy.schema.json`, the CLI
   scaffold and every in-repo pack.

## Phases

### Phase 1 — write the vocabulary down, and guard it

- Record in `CLAUDE.md` (and `packages/renderer/CLAUDE.md`) that a backend actor is a **system**, a
  frontend actor is a **surface**, and `plugin` is reserved for tiptap and bundler plugins.
- Add the guard: a spec that fails when the frontend-actor vocabulary reappears as `plugin`
  (`pluginId`, `definePlugin`, `usePlugin`, `features[].plugin`, `sendToPlugin`, `getRegisteredPlugins`)
  anywhere outside the Decision 2 allowlist and `docs/archive`. Model it on
  `abuddy-host/tests/removed-names-in-docs.spec.ts`, which already does this shape of check with a
  per-file allowance and a reason.

**Done when:** the guard passes on the tree as it will be after Phase 5, and fails when a kept name is
added to the banned list or a banned name is reintroduced. Land the guard **last within this phase's
commit ordering if it would fail mid-rename** — or mark it `it.fails` until Phase 5, and flip it there.
Mutation: renaming `TiptapPlugin` must fail the guard's allowlist assertion, not pass silently.

### Phase 2 — the concept: types, manifest key, codegen, host, renderer, packs

- SDK: `Plugin` → `Surface`, `PluginDefinition` → `SurfaceDefinition`, `definePlugin` → `defineSurface`,
  `usePlugin` → `useSurface`, `PluginHotkeyDefinition`, `PluginScope`, `PluginEvent(s)`, `PluginInbox`,
  `PluginInboxAudiences`, `PackPluginEntry`, `PackFeaturePlugin`, `pluginIsRunning`,
  `useUntypedPluginState`, `readUntypedPluginState`, `untypedOpenPlugin`, `untypedBroadcastToPlugin`,
  `_sendToLocalPlugin` and their neighbours. Run `npm run api:update`.
- Manifest: `features[].plugin` → `features[].surface` in `manifest-schema.ts`; regenerate
  `abuddy.schema.json` (`npm run generate:schema`); update the CLI's `add feature` scaffold and
  `init` templates.
- Codegen: `generate-entries` emits `pack-entry-fe.ts` from the new key; `getRegisteredPlugins` →
  `getRegisteredSurfaces`, `registerPackFE`'s registration field, `FePackRegistryView`.
- Renderer: the application actor's surface list, `packPluginIds`, `loadPackFrontend`, the popout query
  (`?popout=plugin&pluginId=` → the surface spelling), `plugin:popout` IPC, `ToolbarPluginContextMenu.vue`
  and the other `views/layout` components.
- Every in-repo pack: default-setup and `tests/fixtures/*`.

**Done when:** `npm run typecheck`, `npm run api:check`, `npm run schema:check`, `npm run test:unit`,
`npm run compile` and `npm run test:external-pack` pass. `grep -rIn 'definePlugin\|usePlugin\|features\[\]\.plugin'`
finds nothing outside `docs/archive`.

### Phase 3 — the wire: `pluginId` and the event type names

- `pluginId` → `surfaceId` across the transport, the bus, the renderer's routing, the registry's
  validation map (`getPluginEventValidationMap` → `getSurfaceEventValidationMap`) and generated events.
- The event types of Decision 5, with their compile-time pins updated.
- Keep the standing warning in `CLAUDE.md` about the transport stamping this field, under its new name:
  never use `surfaceId` as a field inside an event payload sent via `sendToSurface`.

**Done when:** `npm test -w @abuddy/host` passes, including `tests/bus/outgoing-events.spec.ts` and
`tests/packs/event-validation-map.spec.ts`; `npm run test:unit` and `npm test` pass. Mutation: leaving
one `pluginId` behind in the renderer's routing fails an event-validation or E2E spec rather than
passing silently — if it doesn't, add the spec that catches it.

### Phase 4 — stored user data

- Rename `AppState.pluginVisibility` → `surfaceVisibility` and `lastActivePlugin` → `lastActiveSurface`,
  with a host app migration (Decision 4) that moves an existing row's values.
- Those two fields are the whole of it, checked at `8b9d62114`: per-feature settings are keyed by
  feature and read through `forFeature` (54 call sites), not by plugin, and the frontend's own
  `agentbuddy-last-active-plugin` key was already removed by
  `packages/abuddy-host/src/fe/migrations/0.3.15.ts`. Don't re-hunt for more stored plugin data; if the
  0.3.15 migration's own reads of `lastActivePlugin` need touching, that is Decision 2's allowance,
  not a rename.
- Spec it the way `tests/migrations/app-state-0.3.15.spec.ts` specs the earlier move: a row in the old
  shape, migrated, then migrated again to prove idempotence.

**Done when:** the migration spec passes, including the second run; `npm test -w @abuddy/host` and
`npm test -w @app/api` pass. Mutation: dropping the guard that skips an already-migrated row fails the
idempotence case.

### Phase 5 — docs, and turn the guard on

- `CLAUDE.md`, `packages/renderer/CLAUDE.md`, `packages/abuddy-sdk/CLAUDE.md`,
  `packages/abuddy-host/CLAUDE.md`, `tests/e2e/CLAUDE.md` and the six files under `docs/public-facing/`.
- Flip Phase 1's guard from `it.fails` to live, if it was parked.

**Done when:** the full chain passes: `npm run typecheck`, `npm run api:check`, `npm run schema:check`,
`npm run test:unit`, `npm run compile`, `npm run test:external-pack`, `npm test`. The `grep` in
"Finished when" returns only Decision 2's names and `docs/archive`.

## Deferred

- **Renaming `pack`.** A pack is the extension unit; this goal is about the level below it.
- **Renaming `canvas`, `panel`, `chat`, `settings`.** They are the areas a surface fills, and they read
  correctly already.
- **`docs/archive`.** Archived goals record the vocabulary of their time and are not checked against the
  code (`removed-names-in-docs.spec.ts` skips them).

## Constraints

- Commits only on request, in logical chunks, no attribution lines, `git diff --cached` first.
- No publishing, releases or triggered workflows.
- No real data dirs; no broad `pkill`; E2E in the `abuddy-test` namespace.
- No bare `tsc` on `packages/preload`; no `npm install` in the example pack; no version or release
  metadata edits — Phase 4's migration targets the next unreleased version by *appending to the latest
  target file*, which is not a version bump.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`). This goal renames a
  frontend concept and must not change them; `AppState` is the host's entity and Phase 4 touches its
  fields, not the typed-EARS contract.
- Published packages: no `any`, the TypeScript floor, `api:update` after export changes — Phase 2
  renames roughly eighteen public entries and must update `etc/*.api.md` and the declaration stamps.
- `packages:build` before the CLI suite; `npm run compile` before the api suites and E2E.
- Migrations follow `packages/abuddy-host/src/migrations/CLAUDE.md`: append to the latest unreleased
  target, never create a new version file, and guard for idempotence.
- Investigate a failing test rather than loosening it; mutation-check every new guard.
- **Never run a blind find-and-replace over `plugin`.** Decision 2 lists three vocabularies that keep
  the word, one of which (`tiptapPluginRegistry`, `TiptapPlugin`) is published API.
