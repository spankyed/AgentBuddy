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
2. **Success event** -- `PACK_INSTALL_COMPLETE` so the FE can prompt restart
3. **In-app uninstall** -- `UNINSTALL_PACK` event + handler
4. **Remote source resolution** -- GitHub release download (CLI only handles local dir/zip)
5. **FE feedback** -- toast/notification for install success/failure with "Restart" button

The registry reconciliation at boot already handles adding/removing entries -- once files land in the packs dir, the next boot picks them up automatically.

## Design Decisions

### 1. Where does the install logic live?

New module `packages/api/src/core/packs/pack-installer.ts`.

- It's pack infrastructure, not settings logic
- The settings system action becomes a thin async wrapper
- Shared validation logic with the CLI's `validateInstallSource()` pattern
- Keeps pack-loader focused on boot-time loading

### 2. Source resolution

`INSTALL_PACK` has `packSlug: string` and `source?: string`. For v1:

| `source` | `packSlug` interpreted as | Resolution |
|---|---|---|
| `'local'` | Absolute path to dir or .zip | Same as CLI -- validate + copy |
| `'github'` (or default) | `owner/repo` or `owner/repo@tag` | Fetch GitHub releases API -> find `.tgz` asset -> download -> extract -> validate -> copy |
| `'url'` | Direct URL to `.tgz` | Download -> extract -> validate -> copy |

### 3. Hot-reload vs restart

Restart only for v1. The boot sequence is linear and assumes everything is known at startup. The `app:relaunch` IPC exists. Install writes files to `~/.agentbuddy/packs/`, registry reconciliation picks them up on next boot.

### 4. Enable/disable

The registry already has `enabled: boolean`. `reconcileExternalRegistry()` already filters by it. A future packs UI can toggle this -- set `enabled: false`, restart, and the pack is skipped during load. No implementation needed now, just wire it when the UI exists.

### 5. Publish

For v1, publish stays manual -- `abuddy pack` creates the `.tgz`, author uploads to GitHub releases. A centralized pack registry/store is a later concern.

## Implementation Phases

### Phase 1: `pack-installer.ts`

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

### Phase 2: Settings system wiring

Add to outgoing events:
- `{ type: 'PACK_INSTALL_COMPLETE'; packSlug: string; packId: string; packName: string; version: string }`
- `{ type: 'PACK_UNINSTALL_COMPLETE'; packId: string }`
- `{ type: 'PACK_UNINSTALL_FAILED'; packId: string; error: string }`

Add incoming event:
- `{ type: 'UNINSTALL_PACK'; packId: string }`

Upgrade `installPack` action: call the installer module (async `.then()/.catch()` pattern matching `testCliProvider`), emit started/complete/failed.

Add `uninstallPack` action: same pattern.

### Phase 3: FE feedback

Handle `PACK_INSTALL_COMPLETE` and `PACK_UNINSTALL_COMPLETE` in the settings FE state machine. Show a notification/toast with pack name + version + "Restart now" button. The restart button calls `window.electronAPI.relaunch()` (the `app:relaunch` IPC handler).

### Phase 4 (optional): Pack management UI

A "Packs" tab/section in settings listing installed packs from the registry. Each pack shows name, version, enabled status. Install button (text input for GitHub slug, file picker for local). Uninstall button. Enable/disable toggle.

## Files to Create/Modify

| File | Change |
|---|---|
| `packages/api/src/core/packs/pack-installer.ts` | **NEW** -- install/uninstall orchestration with remote download support |
| `packages/default-setup/src/features/settings/be/system.ts` | Wire `installPack`/`uninstallPack` to new module, add new event types |
| `packages/renderer/src/core/packs/pack-install.ts` | Potentially add `requestPackUninstall()` |
| Settings FE state + UI components | Handle completion events, show feedback |

No changes needed to: `pack-loader.ts`, `pack-registry.ts`, `pack-registration.ts`, `pack-api.ts`, `backend.ts`.

## Sequencing

1. Build `pack-installer.ts` with local-path support first (validates the pipeline without network concerns)
2. Wire into settings system, add success/failure events
3. Add GitHub release resolution
4. Add FE feedback
5. Uninstall path
6. Pack management UI
