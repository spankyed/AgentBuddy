# Upgrade Strategy for AgentBuddy (macOS Electron App)

> Authored 2026-04-05. Covers data safety, schema migrations, auto-update, UX, and edge cases.

---

## 1. Data Safety Audit

**Verdict: Replacing the `.app` bundle is safe.** The bundle lives in `/Applications/AgentBuddy.app/`, while all user data lives in `~/Library/Application Support/AgentBuddy/` (three LMDB shards: `ears-db`, `ears-trace`, `ears-secrets`, plus `media/` and `models-cache/`). These paths are completely independent.

### Edge Cases

| Risk | Severity | Assessment |
|------|----------|-----------|
| Code-sign identity change | None | App doesn't use macOS Keychain; secrets are in `ears-secrets` LMDB |
| Sandboxing enabled | **High** | macOS would relocate userData to `~/Library/Containers/com.agentbuddy.app/`, orphaning existing data. **Never enable without a data migration path.** |
| Electron major version jump | None | userData path derived from `productName` ("AgentBuddy"), stable across Electron versions |
| LMDB file locks during update | Medium | If old process still running, LMDB can't open or could corrupt. Mitigated by existing `SingleInstanceApp` module (`app.requestSingleInstanceLock()`). |
| LMDB corruption from crash during write | Low | LMDB is ACID with copy-on-write internally; resilient to process crashes |

### Required Fix: Graceful LMDB Shutdown

Currently `closePersistence()` (in `packages/api/src/core/ears/attribute-storage.ts`) is only called during backup import. It must also be called on app quit — especially before update-install.

```typescript
// packages/api/src/setup/backend.ts — add shutdown export
export async function shutdownBackend(): Promise<void> {
  closePersistence();
}
```

The main process (`packages/main/src/modules/api-server/ApiServer.ts`) should invoke this via IPC before killing the API child process.

---

## 2. Migration Strategy

### Architecture

Create `packages/api/src/core/migrations/`:

```
migrations/
  index.ts          — runner (chains migrations, auto-backs up)
  registry.ts       — ordered list of Migration objects
  types.ts          — Migration interface
  migrations/
    0.1.0-to-0.2.0.ts   — example migration
```

### Migration Interface

```typescript
// types.ts
export interface Migration {
  fromVersion: string;    // semver, e.g., '0.1.0'
  toVersion: string;      // semver, e.g., '0.2.0'
  description: string;
  migrate: () => void | Promise<void>;
}
```

### Runner

```typescript
// index.ts
import semver from 'semver';
import { migrations } from './registry';
import { exportDatabase } from '@/systems/database/backup';
import { getUserDataPath } from '@/core/helpers/paths';

const TARGET_DATA_VERSION = '0.1.0'; // bump when adding migrations

export async function runMigrations() {
  const internal = settingsQueries.getInternalSettings();
  const currentVersion = internal.version;

  // Downgrade protection
  if (semver.gt(currentVersion, TARGET_DATA_VERSION)) {
    throw new Error(
      `Data version ${currentVersion} is newer than this app supports (${TARGET_DATA_VERSION}). ` +
      `Please update AgentBuddy to the latest version.`
    );
  }

  // Build migration chain
  const chain: Migration[] = [];
  let version = currentVersion;
  for (const m of migrations) {
    if (m.fromVersion === version) {
      chain.push(m);
      version = m.toVersion;
    }
  }

  if (chain.length === 0) return { migrated: false };

  // Auto-backup before migrating
  const backupDir = path.join(getUserDataPath(), 'pre-migration-backups');
  await exportDatabase(backupDir, `pre-migration-${currentVersion}-${Date.now()}`);

  // Execute sequentially, update version after each step (resumable on failure)
  for (const migration of chain) {
    console.log(`[Migration] ${migration.description} (${migration.fromVersion} → ${migration.toVersion})`);
    await migration.migrate();
    settingsCommands.updateSettings('internal', null, ['version'], migration.toVersion);
  }

  return { migrated: true, fromVersion: currentVersion, toVersion: version };
}
```

### Hook Point

Insert into `packages/api/src/setup/backend.ts` between `createDefaultSettings()` and `seedData()`:

```
hydrate → createDefaultSettings → runMigrations() → seedData → start backend
```

Hydrate loads data into memory, `createDefaultSettings` ensures the Settings entity exists, migrations can then read the version and transform in-memory EARS data, and seed runs last on the migrated schema.

### Example Migration

Migrations operate on in-memory EARS data using `qx()` / `tx()` (synchronous, consistent with `migrate-tnodes.ts` pattern):

```typescript
// migrations/0.1.0-to-0.2.0.ts
export const migration_0_1_0_to_0_2_0: Migration = {
  fromVersion: '0.1.0',
  toVersion: '0.2.0',
  description: 'Add metadata field to thread entities',
  migrate() {
    const threadIds = getEntitiesOfType(EARS.Entity.Thread);
    for (const id of threadIds) {
      const data = qx(id).pickOne(['data']);
      if (data?.data && !data.data.metadata) {
        tx(id).put('data', { ...data.data, metadata: {} });
      }
    }
  }
};
```

---

## 3. Auto-Update Recommendation

### Recommendation: `electron-updater` (from `electron-builder`)

| Factor | electron-updater | Squirrel.Mac | Manual DMG |
|--------|-----------------|--------------|------------|
| GitHub Releases integration | Built-in provider | Needs custom server | Custom code |
| Already configured | Yes (builder + signing + ZIP) | No | No |
| Implementation effort | Low | Medium | High |
| ASAR disabled compatibility | Fine | Fine | N/A |
| Native modules (LMDB) | Non-issue (replaces whole `.app`) | Non-issue | Non-issue |
| Differential updates | No (full ZIP) | Delta updates | No |

**Why electron-updater wins:** `electron-builder.mjs` already has GitHub publish support (`PUBLISH_TO_GITHUB` env), macOS ZIP target (required for electron-updater), and code signing (`APPLE_TEAM_ID`). The auto-updater module is already stubbed in `packages/main/src/index.ts:7,32`.

### Implementation Steps

**Step 1: Install**

```bash
npm install electron-updater --workspace=@app/main
```

**Step 2: Create auto-updater module** (`packages/main/src/modules/auto-updater/index.ts`)

```typescript
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater';
import { ipcMain, BrowserWindow } from 'electron';
import type { AppModule } from '../../AppModule.js';

export function createAutoUpdater(): AppModule {
  return {
    enable({ app }) {
      autoUpdater.autoDownload = false;        // let user decide
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowDowngrade = false;      // downgrade protection

      app.whenReady().then(() => {
        setTimeout(() => autoUpdater.checkForUpdates(), 10_000);
        setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
      });

      // Forward events to renderer
      autoUpdater.on('update-available', (info: UpdateInfo) => {
        broadcast('update:available', {
          version: info.version,
          releaseNotes: info.releaseNotes,
        });
      });

      autoUpdater.on('download-progress', (progress: ProgressInfo) => {
        broadcast('update:download-progress', {
          percent: progress.percent,
          transferred: progress.transferred,
          total: progress.total,
        });
      });

      autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
        broadcast('update:downloaded', {
          version: info.version,
          releaseNotes: info.releaseNotes,
        });
      });

      autoUpdater.on('error', (err) => {
        broadcast('update:error', { message: err.message });
      });

      // IPC handlers for renderer-initiated actions
      ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
      ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
      ipcMain.handle('update:install', () => {
        // Coordinate LMDB shutdown before quit
        autoUpdater.quitAndInstall(false, true);
      });
    }
  };
}

function broadcast(channel: string, data: unknown) {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(channel, data);
  });
}
```

**Step 3: Add preload bridge** (`packages/preload/src/index.ts`)

```typescript
const appUpdate = {
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  onAvailable: (cb: (info: any) => void) => {
    ipcRenderer.on('update:available', (_, info) => cb(info));
  },
  onProgress: (cb: (progress: any) => void) => {
    ipcRenderer.on('update:download-progress', (_, p) => cb(p));
  },
  onDownloaded: (cb: (info: any) => void) => {
    ipcRenderer.on('update:downloaded', (_, info) => cb(info));
  },
  onError: (cb: (err: any) => void) => {
    ipcRenderer.on('update:error', (_, err) => cb(err));
  },
};
// Expose via contextBridge.exposeInMainWorld
```

**Step 4:** Uncomment import in `packages/main/src/index.ts`, add `.init(createAutoUpdater())` to module runner

**Step 5:** Set up CI to run `electron-builder --publish always` on Git tag push

---

## 4. UX Improvements

### Update Notification Banner

Application-level Vue component (rendered at the shell level, not inside a plugin), driven by an XState machine:

```
idle → checking → available → downloading → ready
                                              ↓
                                            error
```

| State | UI |
|-------|-----|
| `available` | "Version X.Y.Z available" — **Download** / **What's New** / **Later** |
| `downloading` | Progress bar with percentage |
| `ready` | "Update ready!" — **Restart Now** / **Later** |
| `error` | "Update failed" — **Retry** / **Dismiss** |

### "What's New" Changelog

`electron-updater` delivers `releaseNotes` (Markdown string or `{version, note}[]`) from GitHub Release notes in the `UpdateInfo` object. Render in a modal using a lightweight Markdown renderer.

### Settings Integration

Add "Updates" section to `packages/renderer/src/plugins/settings/canvas/tabs/HelpTab.vue`:
- Current version display
- "Check for Updates" button
- Auto-update toggle (stored in `InternalSettings`)

---

## 5. Edge Cases

### Downgrade Protection

Two layers:
1. **electron-updater**: `allowDowngrade = false` (built-in)
2. **Data level**: migration runner rejects if `InternalSettings.version` > app's `TARGET_DATA_VERSION`

### Corrupted Data Recovery

```typescript
// In setupBackend(), wrap hydrate:
try {
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });
} catch (error) {
  console.error('[CRITICAL] Data hydration failed:', error);
  reinitializeLmdb();
  try {
    await hydrateSharded({ envs, policy, shardedPersistence: persistence });
  } catch {
    process.exit(42); // special exit code
  }
}
```

Main process detects exit code 42 and shows a recovery dialog:
- **Reset Data** — calls `resetLmdbFiles()` and relaunches
- **Import Backup** — opens file picker for a backup directory
- **Quit**

### First-Launch-After-Update Hook

Add `lastAppVersion` field to `InternalSettings`. Main process passes `APP_VERSION` env var to API server. On version mismatch at startup:

1. Clean up `pre-migration-backups/` older than 30 days
2. Clear `ears-trace` volatile partition (old session data may be incompatible)
3. Force re-seed: `seedData({ force: true })` to pick up new DSL artifacts
4. Set flag for frontend to show "What's New" modal

---

## Implementation Priority

### Phase 1: Foundation (do first)
1. Add `closePersistence()` to backend shutdown path
2. Create migration system framework (`packages/api/src/core/migrations/`)
3. Add `lastAppVersion` to `InternalSettings`
4. Hook migrations into `setupBackend()` between hydrate and seed

### Phase 2: Auto-Updater
5. Install `electron-updater`, create auto-updater module
6. Add preload IPC bridge
7. Set up CI for publish-on-tag
8. Test full update cycle: bump version → push tag → build → publish → verify

### Phase 3: UX
9. Update notification banner (Vue + XState)
10. Settings "Updates" section
11. "What's New" changelog modal

### Phase 4: Resilience
12. Corruption recovery dialog in main process
13. First-launch-after-update cleanup
14. Downgrade protection at data level

---

## Critical Files

| File | Role |
|------|------|
| `packages/api/src/setup/backend.ts` | Migration hook point (between hydrate and seed) |
| `packages/api/src/systems/settings/defaults.ts:171-177` | InternalSettings (version, add lastAppVersion) |
| `packages/api/src/systems/database/backup.ts` | Existing backup system (reuse for pre-migration) |
| `packages/api/src/core/ears/attribute-storage.ts` | `closePersistence()`, `reinitializeLmdb()` |
| `packages/main/src/index.ts` | Module runner chain (auto-updater registration) |
| `packages/main/src/modules/api-server/ApiServer.ts` | API shutdown coordination |
| `packages/main/src/modules/api-server/config.ts:45-52` | Env vars passed to API process |
| `packages/preload/src/index.ts` | IPC bridge for update events |
| `electron-builder.mjs` | Build config (already has GitHub publish + ZIP) |
