# Pack Install/Publish Flow

Design plan for the in-app pack install pipeline and related infrastructure.

## Current State

| Layer | Status |
|---|---|
| **CLI** (`pack-cli`) | `install` from local dir/zip, `uninstall`, `pack` (-> .tgz), `build`, `init`, `validate`, `list`, `dev` |
| **Deep link** | `abuddy://install?pack=<slug>&source=<source>` -> renderer -> `INSTALL_PACK` event to settings system |
| **Settings system** | `INSTALL_PACK` handler: stub (logs + emits `PACK_INSTALL_STARTED`). No success event. No `UNINSTALL_PACK`. |
| **Boot loader** | Full pipeline: discover -> `reconcileExternalRegistry()` (syncs JSON, filters by `enabled`) -> load -> register. External packs run before hydration. |
| **Pack registry** | External-only JSON file with `enabled` flag. Reconciled automatically at boot -- new packs added, missing packs pruned. |
| **FE** | `pack-install.ts` sends event. `main.ts` loads pack FE entries from `trpc.packs.registry`. Supports both `fe.entry` (full registration) and legacy per-plugin path. |

## Gap

The `INSTALL_PACK` handler is a stub. The CLI's `install` only takes local paths. What's missing:

1. **In-app install pipeline** -- when `INSTALL_PACK` fires, download from a remote source and copy to `~/.agentbuddy/packs/`
2. **Packs BE system** -- a dedicated backend system owning pack management (install, uninstall, enable/disable, list)
3. **Packs FE plugin** -- a dedicated toolbar plugin for the pack management UI
4. **Remote source resolution** -- GitHub release download (CLI only handles local dir/zip)
5. **FE feedback** -- progress/status in the packs plugin canvas

The registry reconciliation at boot already handles adding/removing entries -- once files land in the packs dir, the next boot picks them up automatically.

## Design Decisions

### 1. Dedicated packs backend system

A new `packs` BE system owns all pack management events instead of piggybacking on the settings system. The settings system's `INSTALL_PACK` stub gets removed.

**Why a separate system:**
- Settings system is already the largest system (settings CRUD, secrets, CLI testing, setup pack import/preview, app reset)
- Pack management is a distinct domain -- install, uninstall, enable/disable, list
- Clean event routing: FE packs plugin sends directly to `packs` system, receives events back from `packs` system
- The installer module (`pack-installer.ts`) is called by the packs system, not settings

**Host-registered system pattern:**

All systems today come from packs via `PackRegistration` -> `getRegisteredSystems()`. The packs system is host infrastructure -- it exists regardless of which packs are installed. It's registered in `backend.ts` before packs load, via a new `registerHostSystem(id, machine)` function in `pack-registration.ts` that inserts directly into the systems map without going through the full `registerPack()` collision-detection path.

```
backend.ts boot sequence (revised):
  1. registerHostSystem('packs', packsSystem)  <-- NEW: before any pack loading
  2. loadBuiltInPacks()
  3. earlySystem hooks
  4. loadExternalPacks() + registerExternalPacks()
  5. hydrateSharded()
  ...rest unchanged
```

This means `spawnActors` in `systems.ts` picks it up automatically, `routeIncoming` routes events to it, and `sendConnected` sends `CLIENT_CONNECTED` to it.

**Where it lives:** `packages/api/src/core/packs/packs-system.ts` -- alongside the other pack modules, not in default-setup.

**Events:**

Incoming:
- `{ type: 'CLIENT_CONNECTED' }` -- send initial installed packs list to FE
- `{ type: 'INSTALL_PACK'; packSlug: string; source?: string }` -- trigger install
- `{ type: 'UNINSTALL_PACK'; packId: string }` -- trigger uninstall
- `{ type: 'TOGGLE_PACK_ENABLED'; packId: string }` -- flip enabled flag in registry
- `{ type: 'GET_INSTALLED_PACKS' }` -- re-fetch and send pack list

Outgoing (to FE packs plugin):
- `{ type: 'PACKS_LIST'; packs: PackInfo[] }` -- full installed packs list
- `{ type: 'PACK_INSTALL_STARTED'; packSlug: string }`
- `{ type: 'PACK_INSTALL_COMPLETE'; packSlug: string; packId: string; packName: string; version: string }`
- `{ type: 'PACK_INSTALL_FAILED'; packSlug: string; error: string }`
- `{ type: 'PACK_UNINSTALL_COMPLETE'; packId: string }`
- `{ type: 'PACK_UNINSTALL_FAILED'; packId: string; error: string }`
- `{ type: 'PACK_ENABLED_CHANGED'; packId: string; enabled: boolean }`

### 2. Where does the install logic live?

New module `packages/api/src/core/packs/pack-installer.ts`. Pure functions called by the packs system.

### 3. Source resolution

`INSTALL_PACK` has `packSlug: string` and `source?: string`. For v1:

| `source` | `packSlug` interpreted as | Resolution |
|---|---|---|
| `'local'` | Absolute path to dir or .zip | Same as CLI -- validate + copy |
| `'github'` (or default) | `owner/repo` or `owner/repo@tag` | Fetch GitHub releases API -> find `.tgz` asset -> download -> extract -> validate -> copy |
| `'url'` | Direct URL to `.tgz` | Download -> extract -> validate -> copy |

### 4. Hot-reload vs restart

Restart only for v1. The boot sequence is linear and assumes everything is known at startup. The `app:relaunch` IPC exists. Install writes files to `~/.agentbuddy/packs/`, registry reconciliation picks them up on next boot.

### 5. Enable/disable

The registry already has `enabled: boolean`. `reconcileExternalRegistry()` already filters by it. The packs system handles `TOGGLE_PACK_ENABLED` by flipping the flag in `pack-registry.json` and emitting `PACK_ENABLED_CHANGED`. Takes effect on next restart.

### 6. Publish

For v1, publish stays manual -- `abuddy pack` creates the `.tgz`, author uploads to GitHub releases. A centralized pack registry/store is a later concern.

### 7. Packs FE plugin (internal toolbar plugin)

A hardcoded, internal plugin that lives in `packages/renderer/` (not in default-setup). It appears in the pinned section of the toolbar, below Settings, as the very last item.

**Why internal, not in default-setup:**
- Pack management is host-level infrastructure, not a feature pack contributes
- It needs direct access to the application state
- It should always exist regardless of which packs are installed

**How it works:**

The plugin follows the standard `Plugin` interface (`id`, `label`, `icon`, `state`, `canvas`, `isPinned: true`). It has an XState state machine and a canvas component. No `settings` component -- pack management IS the settings for packs.

**Toolbar ordering:**

The toolbar renders pinned items in array order. Currently Settings is last in the plugins array. The packs plugin is appended after all pack-registered plugins in `main.ts`, after `getRegisteredPlugins()` returns. This guarantees it's always the last pinned item regardless of what packs register.

```
main.ts:
  const plugins = getRegisteredPlugins();       // default-setup plugins (Settings is last)
  const allPlugins = [...plugins, packsPlugin]; // packs plugin appended at the end
```

The application actor spawns all plugins from its `plugins` array, including the packs plugin. This means:
- It gets a state machine actor spawned like any other plugin
- `SELECT_PLUGIN` works for switching to/from it
- Context menu works (via `ToolbarPluginContextMenu`)
- Plugin visibility toggle works (can be hidden but not by default)
- Hotkey-based plugin switching (up/down) includes it

**FE state machine events:**

- `CLIENT_CONNECTED` -- initial connection (no-op, waits for `PACKS_LIST`)
- `PACKS_LIST` -- received from BE packs system, stores pack list in context
- `PACK_INSTALL_STARTED` / `PACK_INSTALL_COMPLETE` / `PACK_INSTALL_FAILED` -- install progress
- `PACK_UNINSTALL_COMPLETE` / `PACK_UNINSTALL_FAILED` -- uninstall progress
- `PACK_ENABLED_CHANGED` -- update local state
- Internal events for UI state (install form, confirmation dialogs)

The FE plugin sends commands to the `packs` BE system via the bus:
```typescript
trpc.bus.send.mutate({ systemId: 'packs', type: 'INSTALL_PACK', packSlug, source })
```

**What the canvas shows:**

- List of installed packs with name, version, enabled/disabled toggle, uninstall button
- Install section: text input for GitHub slug / URL, or file picker for local path
- Status indicators (active, needs-restart, failed-to-load)
- "Restart to apply changes" banner when install/uninstall/toggle occurred

**File structure:**

```
packages/renderer/src/core/packs/
  plugin.ts          -- Plugin definition (id, label, icon, state, canvas, isPinned)
  state.ts           -- XState state machine
  canvas/
    index.vue        -- Main canvas component
    PackList.vue     -- Installed packs list
    InstallForm.vue  -- Install from source form
```

### 8. Deep link update

The existing deep link handler in `renderer/src/core/packs/pack-install.ts` currently sends `INSTALL_PACK` to the settings system (via `getDesignated('settings')`). Update it to send to the `packs` system instead:

```typescript
trpc.bus.send.mutate({ systemId: 'packs', type: 'INSTALL_PACK', packSlug, source })
```

### 9. Settings system cleanup

Remove from the settings system:
- `INSTALL_PACK` incoming event type
- `PACK_INSTALL_STARTED` / `PACK_INSTALL_FAILED` outgoing event types
- `installPack` action
- `INSTALL_PACK` transition in the state machine

The settings system no longer handles any pack operations.

## Implementation Phases

### Phase 1: Packs BE system + host-registered system pattern

1. Add `registerHostSystem(id, machine)` to `pack-registration.ts` -- inserts into the systems map directly
2. Create `packages/api/src/core/packs/packs-system.ts` -- XState machine handling pack events
3. Register in `backend.ts` before `loadBuiltInPacks()`
4. Start with `CLIENT_CONNECTED` -> read pack-registry.json -> emit `PACKS_LIST`

### Phase 2: Packs FE plugin scaffold

Create the internal packs plugin in `packages/renderer/src/core/packs/`:
- `plugin.ts` -- plugin definition with `isPinned: true`
- `state.ts` -- XState machine handling `PACKS_LIST` and pack events
- `canvas/index.vue` -- placeholder canvas that lists installed packs from state

Wire into `main.ts`:
- Import the packs plugin
- Append it to the plugins array after `getRegisteredPlugins()`
- Pass the combined array to `createApplicationState()`

### Phase 3: `pack-installer.ts`

New module at `packages/api/src/core/packs/pack-installer.ts`.

```typescript
installPackFromLocal(source: string): Promise<InstallResult>
installPackFromUrl(url: string): Promise<InstallResult>
installPackFromGitHub(slug: string): Promise<InstallResult>
installPack(packSlug: string, source?: string): Promise<InstallResult>
uninstallPack(packId: string): Promise<void>
```

Where `InstallResult = { id: string; name: string; version: string; dir: string }`.

**Core flow:** resolve source -> download to temp dir -> validate manifest (reuse CLI's checks: id format, required fields, dist/ exists) -> host version check -> copy to `~/.agentbuddy/packs/<id>/` (replace if exists) -> return result. Temp dir cleaned up in `finally`.

**GitHub resolution:** `fetch('https://api.github.com/repos/{owner}/{repo}/releases/latest')` -> find asset matching `*.tgz` -> download -> extract with `tar` -> validate -> copy.

**Uninstall:** verify pack exists -> `rm -rf` the pack dir -> done (registry reconciliation at next boot removes the entry).

### Phase 4: Wire installer into packs system

Connect the packs system actions to the installer module:
- `INSTALL_PACK` -> call `installPack()`, emit started/complete/failed
- `UNINSTALL_PACK` -> call `uninstallPack()`, emit complete/failed
- `TOGGLE_PACK_ENABLED` -> flip flag in registry, emit changed

### Phase 5: Settings system cleanup + deep link update

- Remove all pack-related events, actions, and transitions from the settings system
- Update `renderer/src/core/packs/pack-install.ts` to send to `packs` system instead of settings

### Phase 6: Pack management UI

Build out the packs plugin canvas:
- Pack list with name, version, enabled toggle, uninstall button
- Install form (GitHub slug input, local file picker)
- "Restart to apply" banner when changes are pending
- Install progress indicators

### Phase 7: GitHub release resolution

Add `installPackFromGitHub()` to the installer module. This is the remote download path.

## Files to Create/Modify

| File | Change |
|---|---|
| `packages/api/src/core/packs/packs-system.ts` | **NEW** -- packs BE system (XState machine) |
| `packages/api/src/core/packs/pack-installer.ts` | **NEW** -- install/uninstall orchestration |
| `packages/api/src/core/packs/pack-registration.ts` | Add `registerHostSystem()` |
| `packages/api/src/setup/backend.ts` | Register packs system before pack loading |
| `packages/default-setup/src/features/settings/be/system.ts` | Remove `INSTALL_PACK` events/actions/transitions |
| `packages/renderer/src/core/packs/plugin.ts` | **NEW** -- packs FE plugin definition |
| `packages/renderer/src/core/packs/state.ts` | **NEW** -- packs FE state machine |
| `packages/renderer/src/core/packs/canvas/index.vue` | **NEW** -- packs management canvas |
| `packages/renderer/src/core/packs/canvas/PackList.vue` | **NEW** -- installed packs list component |
| `packages/renderer/src/core/packs/canvas/InstallForm.vue` | **NEW** -- pack install form component |
| `packages/renderer/src/core/packs/pack-install.ts` | Update to send to `packs` system instead of settings |
| `packages/renderer/src/main.ts` | Append packs plugin to plugins array |

No changes needed to: `pack-loader.ts`, `pack-registry.ts`, `pack-api.ts`.

## Sequencing

1. Packs BE system + `registerHostSystem()` (Phase 1) -- establish the host system pattern
2. Packs FE plugin scaffold (Phase 2) -- get it showing in the toolbar with data from BE
3. `pack-installer.ts` with local-path support (Phase 3)
4. Wire installer into packs system (Phase 4)
5. Settings cleanup + deep link update (Phase 5)
6. Pack management UI (Phase 6)
7. GitHub release resolution (Phase 7)
