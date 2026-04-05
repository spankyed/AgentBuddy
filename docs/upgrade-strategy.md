# AgentBuddy Upgrade Strategy

## 1. App Bundle vs User Data Separation

### How macOS Handles It

On macOS, the `.app` bundle (e.g. `/Applications/AgentBuddy.app`) and user data live in completely separate filesystem locations:

| What | Location |
|------|----------|
| App bundle | `/Applications/AgentBuddy.app` |
| User data | `~/Library/Application Support/AgentBuddy/` |
| LMDB primary | `~/Library/Application Support/AgentBuddy/ears-db` |
| LMDB secrets | `~/Library/Application Support/AgentBuddy/ears-secrets` |
| LMDB volatile | `~/Library/Application Support/AgentBuddy/ears-trace` |
| Search indices | `~/Library/Application Support/AgentBuddy/search-indices` |
| Media uploads | `~/Library/Application Support/AgentBuddy/media` |

**Replacing the `.app` bundle — whether via DMG drag-install, `electron-updater`, or `cp -R` — does not touch `~/Library/Application Support/`.** The Electron `app.getPath('userData')` path is stable across updates because it is derived from the app's bundle identifier (`com.agentbuddy.app` in `electron-builder.mjs`), not the bundle's filesystem path.

### Requirements

- **Never change the `appId`** in `electron-builder.mjs`. Changing it would orphan existing user data.
- The `USER_DATA_PATH` env var passed to the API server (set in `ApiServer.ts`) already resolves via `app.getPath('userData')`, which is stable.
- ASAR is disabled, so there are no archive-related side effects during replacement.

### Recommendation

No changes needed. The current architecture already guarantees data safety during app replacement. Document this invariant in CLAUDE.md so future contributors don't accidentally change the `appId`.

---

## 2. LMDB Schema Migration Design

### Current State

There is no schema versioning. The EARS layer stores attributes as typed `{t, v}` pairs and relations as `{kind, src, tgt, info}` objects. Entity "shape" is implicit — defined by which `AttrKind` values each system writes. This means schema changes (new attributes, renamed kinds, changed value shapes) have no guard rails.

### Design: Lightweight Versioned Migrations

Store a schema version in a dedicated LMDB key and run forward-only migrations at startup, before hydration.

#### 2.1 Version Storage

Use the existing `entities` database in the primary LMDB environment to store a sentinel key:

```typescript
// packages/api/src/core/persistence/migrations/version.ts
import { getLmdbPath } from '@/core/helpers/paths';
import { open } from 'lmdb';

const SCHEMA_VERSION_KEY = '__schema_version__';

export function readSchemaVersion(db: RootDatabase): number {
  return (db.get(SCHEMA_VERSION_KEY) as number) ?? 0;
}

export function writeSchemaVersion(db: RootDatabase, version: number): void {
  db.putSync(SCHEMA_VERSION_KEY, version);
}
```

#### 2.2 Migration Registry

Each migration is a pure function that receives the raw LMDB databases and performs synchronous transformations:

```typescript
// packages/api/src/core/persistence/migrations/registry.ts
import type { LmdbDbs } from '../lmdb/envs';

export interface Migration {
  version: number;
  description: string;
  up(dbs: LmdbDbs): void;
}

// Migrations are ordered. Each runs inside a transactionSync.
export const migrations: Migration[] = [
  // Example: rename an attribute kind
  {
    version: 1,
    description: 'Rename AttrKind.Label to AttrKind.DisplayName',
    up(dbs) {
      const SEP = '\x1F';
      for (const { key, value } of dbs.attrs.getRange()) {
        const k = String(key);
        if (k.startsWith(`label${SEP}`)) {
          const newKey = k.replace(`label${SEP}`, `displayName${SEP}`);
          dbs.attrs.putSync(newKey, value);
          dbs.attrs.removeSync(k);
        }
      }
    },
  },
];
```

#### 2.3 Migration Runner

Runs after LMDB environments are opened but **before** `hydrateSharded()`:

```typescript
// packages/api/src/core/persistence/migrations/runner.ts
import { readSchemaVersion, writeSchemaVersion } from './version';
import { migrations } from './registry';
import type { LmdbDbs } from '../lmdb/envs';

export function runMigrations(dbs: LmdbDbs): void {
  const current = readSchemaVersion(dbs.root);
  const pending = migrations.filter(m => m.version > current);

  if (pending.length === 0) return;

  console.log(`[Migration] Running ${pending.length} migration(s) from v${current}...`);

  for (const migration of pending) {
    console.log(`[Migration] v${migration.version}: ${migration.description}`);
    dbs.root.transactionSync(() => {
      migration.up(dbs);
      writeSchemaVersion(dbs.root, migration.version);
    });
  }

  console.log(`[Migration] Complete. Schema now at v${pending.at(-1)!.version}`);
}
```

#### 2.4 Integration Point

In the startup sequence, call `runMigrations()` between `openEnvAt()` and `hydrateSharded()`:

```
openEnvAt(basePath)
  → runMigrations(dbs)        // NEW
  → hydrateSharded(...)
  → app ready
```

#### 2.5 Guidelines

- **Forward-only.** No `down()` functions. Rollback via backup restore (see Section 5).
- **Atomic per migration.** Each migration runs inside `transactionSync()`. If it throws, LMDB rolls back that transaction; the version number stays at the last successful migration.
- **Test migrations** against a snapshot of production data before release.
- **Backup before migrating** (see Section 5.2).
- Migrations touch raw LMDB keys, not the in-memory EARS layer — EARS is not yet hydrated when migrations run.

---

## 3. Auto-Update Mechanism Evaluation

### Options Compared

| Criteria | `electron-updater` | Squirrel.Mac | Manual DMG |
|---|---|---|---|
| **electron-builder integration** | Native — reads `publish` config directly | Requires separate Squirrel server or S3 | N/A |
| **GitHub Releases support** | Built-in `GenericProvider` + `GithubProvider` | Need custom feed URL | Manual download link |
| **Code signing** | Works with existing hardened runtime + notarization | Works but requires specific signing flow | N/A |
| **Differential updates** | ZIP-based full download (blockmap diffing available) | Full download per release | Full DMG download |
| **macOS DMG support** | Downloads ZIP, replaces app in-place | Uses `.app` zip, not DMG | User drags DMG |
| **ASAR-disabled apps** | Works fine — replaces entire app directory | Works fine | Works fine |
| **Setup effort** | Minimal — uncomment existing code, add dep | Moderate — need update server or S3 | Zero — already works |
| **User friction** | Zero — silent background update | Zero — silent | High — manual download + drag |
| **Staged rollouts** | Supported via `staging` percentage | Not built-in | Manual |
| **Auto-update UX control** | Full control via event API | Limited | N/A |

### Recommendation: `electron-updater`

**Priority: High.** This is the clear winner given the existing setup:

1. **Already scaffolded.** The `autoUpdater` module import exists in `packages/main/src/index.ts` (line 7, commented out). The `publish` config exists in `electron-builder.mjs` (line 138).
2. **Zero infrastructure.** Reads directly from GitHub Releases — no update server needed.
3. **Proven with electron-builder.** Same maintainer, same ecosystem, handles code signing and notarization natively.
4. **Full event API** for custom UX (see Section 4).

#### Implementation Steps

1. Install the dependency:
   ```bash
   npm install electron-updater --save
   ```

2. Create the `AutoUpdater` module following the existing `ModuleRunner` pattern:

   ```typescript
   // packages/main/src/modules/AutoUpdater.ts
   import { autoUpdater } from 'electron-updater';
   import type { Module } from '../ModuleRunner';

   export function createAutoUpdater(): Module {
     return {
       name: 'auto-updater',
       async enable() {
         autoUpdater.autoDownload = false;    // Let user decide
         autoUpdater.autoInstallOnAppQuit = true;

         // Forward events to renderer (see Section 4)
         autoUpdater.on('update-available', (info) => {
           broadcastToWindows('update:available', info);
         });

         autoUpdater.on('download-progress', (progress) => {
           broadcastToWindows('update:download-progress', progress);
         });

         autoUpdater.on('update-downloaded', (info) => {
           broadcastToWindows('update:downloaded', info);
         });

         autoUpdater.on('error', (err) => {
           broadcastToWindows('update:error', err.message);
         });

         // Check on launch, then every 4 hours
         autoUpdater.checkForUpdates();
         setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
       },
     };
   }
   ```

3. Uncomment and wire in `index.ts`:
   ```typescript
   .init(createAutoUpdater())
   ```

4. Ensure `publish` in `electron-builder.mjs` is always set (not conditional):
   ```javascript
   publish: {
     provider: 'github',
     owner: 'spankyed',
     repo: 'AgentBuddy',
     releaseType: 'release',  // Change from 'draft' to 'release' for auto-update
   }
   ```

   > `electron-updater` cannot see draft releases. Publish as proper releases (or pre-releases for beta channels).

5. The ZIP target already exists in `electron-builder.mjs` — `electron-updater` on macOS uses the ZIP artifact, not the DMG. The DMG remains available for first-time manual installs.

---

## 4. In-App Update UX

### 4.1 Event Flow

```
Main Process (electron-updater)          Renderer (Vue)
─────────────────────────────           ──────────────
checkForUpdates()
  → 'update-available' ──────IPC──────→ Show notification bar
                                         "v1.2.0 available — What's New | Update"
  user clicks "Update"
  ← ipcMain 'update:start-download' ←──
autoUpdater.downloadUpdate()
  → 'download-progress' ─────IPC──────→ Progress bar (percent, bytesPerSecond)
  → 'update-downloaded' ─────IPC──────→ "Ready to install — Restart Now | Later"
  user clicks "Restart Now"
  ← ipcMain 'update:install' ←────────
autoUpdater.quitAndInstall()
```

### 4.2 Preload Bridge Additions

Extend the existing `electronAPI` in `packages/preload/src/exposed.ts`:

```typescript
appUpdate: {
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) =>
    ipcRenderer.on('update:available', (_e, info) => cb(info)),
  onDownloadProgress: (cb: (progress: ProgressInfo) => void) =>
    ipcRenderer.on('update:download-progress', (_e, progress) => cb(progress)),
  onUpdateDownloaded: (cb: (info: UpdateInfo) => void) =>
    ipcRenderer.on('update:downloaded', (_e, info) => cb(info)),
  onUpdateError: (cb: (message: string) => void) =>
    ipcRenderer.on('update:error', (_e, msg) => cb(msg)),
  startDownload: () => ipcRenderer.invoke('update:start-download'),
  installAndRestart: () => ipcRenderer.invoke('update:install'),
  dismissUpdate: () => ipcRenderer.invoke('update:dismiss'),
}
```

### 4.3 Changelog from GitHub Release Notes

`electron-updater`'s `UpdateInfo` includes `releaseNotes` (string or array of `{version, note}`), pulled directly from the GitHub Release body. The release script already generates changelogs from conventional commits — these become the release notes.

```typescript
// In the renderer notification component
const changelog = computed(() => {
  if (!updateInfo.value?.releaseNotes) return '';
  const notes = updateInfo.value.releaseNotes;
  return typeof notes === 'string'
    ? notes
    : notes.map(n => n.note).join('\n');
});
```

Render with a markdown component or `v-html` after sanitization.

### 4.4 UX Recommendations

| Behavior | Recommendation |
|----------|---------------|
| **Check frequency** | On launch + every 4 hours |
| **Notification style** | Non-modal top banner (dismissible) |
| **Download** | User-initiated (not automatic) |
| **Progress** | Inline progress bar with percentage + speed |
| **Install** | "Restart Now" or auto-install on next quit |
| **Changelog** | Expandable section in the notification banner |
| **Dismissed updates** | Don't re-notify for the same version until next launch |

---

## 5. Edge Cases

### 5.1 Downgrade Protection

**Problem:** A user running v2.0 (schema v5) installs an older v1.5 (schema v3). The older code doesn't understand the newer schema.

**Solution:** Check schema version at startup:

```typescript
// In the migration runner, before running migrations
const appSchemaVersion = migrations.at(-1)?.version ?? 0;
const dbSchemaVersion = readSchemaVersion(dbs.root);

if (dbSchemaVersion > appSchemaVersion) {
  throw new Error(
    `Database schema (v${dbSchemaVersion}) is newer than this app supports (v${appSchemaVersion}). ` +
    `Please update AgentBuddy or reset your data.`
  );
}
```

Surface this error in the splash screen. The app should refuse to start rather than silently corrupt data.

Additionally, configure `electron-updater` to prevent downgrades:

```typescript
autoUpdater.allowDowngrade = false; // Default is false — keep it
```

### 5.2 Data Corruption Recovery

**Problem:** LMDB is crash-safe (MVCC + copy-on-write), but a failed migration or disk issue could still leave data in a bad state.

#### Pre-Migration Backup

Before running any migrations, snapshot the LMDB directories:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { getUserDataPath } from '@/core/helpers/paths';

function backupBeforeMigration(fromVersion: number, toVersion: number): string {
  const userDataPath = getUserDataPath();
  const backupDir = path.join(userDataPath, 'backups', `pre-migration-v${fromVersion}-to-v${toVersion}`);

  for (const subdir of ['ears-db', 'ears-secrets']) {
    const src = path.join(userDataPath, subdir);
    const dest = path.join(backupDir, subdir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
    }
  }

  return backupDir;
}
```

#### Backup Retention

Keep the last 3 backups. Prune older ones after successful migration:

```typescript
function pruneOldBackups(keepCount = 3): void {
  const backupsDir = path.join(getUserDataPath(), 'backups');
  if (!fs.existsSync(backupsDir)) return;

  const entries = fs.readdirSync(backupsDir)
    .filter(e => e.startsWith('pre-migration-'))
    .sort()
    .reverse();

  for (const entry of entries.slice(keepCount)) {
    fs.rmSync(path.join(backupsDir, entry), { recursive: true, force: true });
  }
}
```

#### Recovery Options

1. **Automatic:** If migration throws, the `transactionSync` rollback keeps the DB at the last good version. The app can retry on next launch.
2. **Manual:** Expose a "Restore from backup" option in the app's database system (the existing `RESET_DATABASE` event could be extended with a "restore from backup" variant).
3. **Nuclear:** The existing `resetLmdbFiles()` in `attribute-storage.ts` already handles full wipe and recreate. Seed data from `packages/api/src/setup/seed/data/` is re-imported on next startup.

### 5.3 Post-Update Cleanup Hooks

**Problem:** After an update, the app may need to clear caches, re-index search, or remove deprecated files.

**Solution:** Tie cleanup to the migration system. Each migration can include optional cleanup:

```typescript
export interface Migration {
  version: number;
  description: string;
  up(dbs: LmdbDbs): void;
  postHydrate?(): void;  // Runs after hydration is complete
}
```

Run `postHydrate` hooks after `hydrateSharded()`:

```typescript
// After hydration
const ranMigrations = migrations.filter(
  m => m.version > previousVersion && m.version <= currentVersion
);
for (const m of ranMigrations) {
  m.postHydrate?.();
}
```

Common cleanup tasks:
- **Clear models cache:** `rm -rf ~/Library/Application Support/AgentBuddy/models-cache`
- **Rebuild search indices:** Delete and re-index via the search system
- **Remove deprecated files:** Clean up old config formats

### 5.4 Interrupted Updates

**Problem:** The app quits mid-download or the machine loses power during install.

**`electron-updater` handles this:**
- Downloads to a temp directory; incomplete downloads are discarded on next check.
- On macOS, app replacement is an atomic `rename()` operation (ShipIt helper).
- If `autoInstallOnAppQuit` is true and the download completed, the update applies on next quit — no data loss.

### 5.5 Concurrent LMDB Access During Update

**Problem:** The API server (child process) has LMDB open when the main process triggers `quitAndInstall()`.

**Solution:** The existing graceful shutdown in `process-manager.ts` sends SIGTERM to the API server with a 5-second grace period. The LMDB adapter's `close()` function flushes pending writes before exit. This sequence is already correct:

```
quitAndInstall() → app 'before-quit' → SIGTERM to API → adapter.close() → flush → exit
```

No changes needed, but verify that `adapter.close()` is wired into the API server's shutdown handler.

---

## Priority Summary

| Priority | Item | Effort |
|----------|------|--------|
| **P0** | Install `electron-updater`, uncomment `AutoUpdater` module, set `publish.releaseType` to `'release'` | Low |
| **P0** | Add schema version key to LMDB + migration runner | Low |
| **P1** | Pre-migration backup + downgrade protection | Low |
| **P1** | Preload bridge for update events + renderer notification banner | Medium |
| **P2** | Changelog rendering in update notification | Low |
| **P2** | Post-hydrate cleanup hooks | Low |
| **P3** | Backup pruning + manual restore UI | Medium |
