# Upgrade System Implementation Prompt

Act as a senior Electron desktop app engineer with deep experience in electron-builder, electron-updater, LMDB, and XState actor systems. You are implementing the upgrade system for AgentBuddy — a macOS Electron app with an actor-based architecture. Both frontend (Vue 3) and backend (Node.js/Fastify) are built on XState state machines. Data is persisted via an in-memory EARS (Entity-Attribute-Relation) graph database backed by LMDB, with three sharded partitions (primary, secrets, volatile).

Read `CLAUDE.md` at the project root and in `packages/api/src/systems/`, `packages/renderer/src/plugins/`, and `packages/default-setup/` for full architecture context.

Read `docs/upgrade-strategy.md` for the complete design document with code sketches, priority table, and architectural decisions. That document is your spec — follow its designs, integration points, and conventions exactly.

## Tasks (in priority order)

### P0 — Auto-Update via electron-updater

1. Install `electron-updater` as a production dependency.
2. Create `packages/main/src/modules/AutoUpdater.ts` following the existing `ModuleRunner` module pattern (see `ApiServer.ts`, `SplashScreen.ts` for examples). Wire `electron-updater` events (`update-available`, `download-progress`, `update-downloaded`, `error`) to IPC broadcasts. Set `autoDownload: false`, `autoInstallOnAppQuit: true`. Check for updates on launch and every 4 hours.
3. Uncomment the auto-updater import in `packages/main/src/index.ts` (line 7) and wire the new module into the `ModuleRunner` chain (line 31-32).
4. In `electron-builder.mjs`, make the `publish` config unconditional (remove the `PUBLISH_TO_GITHUB` conditional) and change `releaseType` from `'draft'` to `'release'`. `electron-updater` cannot see draft releases.
5. Add IPC handlers in the main process for `update:start-download`, `update:install`, and `update:dismiss`.

### P0 — LMDB Schema Migration System

1. Create `packages/api/src/core/persistence/migrations/` with three files:
   - `version.ts` — `readSchemaVersion(db)` and `writeSchemaVersion(db, version)` using the `__schema_version__` sentinel key on the root LMDB database.
   - `registry.ts` — `Migration` interface (`version`, `description`, `up(dbs)`) and an empty `migrations` array. Include a commented-out example migration.
   - `runner.ts` — `runMigrations(dbs)` that reads current version, filters pending migrations, runs each inside `transactionSync`, and updates the version after each.
2. Add downgrade protection in the runner: if `dbSchemaVersion > appSchemaVersion`, throw a descriptive error that surfaces on the splash screen.
3. Integrate `runMigrations()` into the startup sequence — it must run after `openEnvAt()` but before `hydrateSharded()`. Find the call site in the persistence initialization code and insert the call there.

### P1 — Pre-Migration Backup + Recovery

1. Before running pending migrations, copy `ears-db` and `ears-secrets` directories to `~/Library/Application Support/AgentBuddy/backups/pre-migration-v{from}-to-v{to}/`.
2. After successful migration, prune backups older than the 3 most recent.
3. Skip backup if there are no pending migrations.

### P1 — Preload Bridge + Renderer Update Notification

1. Extend `packages/preload/src/exposed.ts` with an `appUpdate` namespace exposing: `onUpdateAvailable`, `onDownloadProgress`, `onUpdateDownloaded`, `onUpdateError`, `startDownload`, `installAndRestart`, `dismissUpdate`.
2. Add the corresponding TypeScript types to the preload type declarations.
3. Create a Vue component for the update notification banner — non-modal, dismissible, positioned at the top of the app. It should show:
   - "v{version} available" with a "What's New" toggle and "Update" button.
   - Download progress bar (percentage + speed) after user clicks "Update".
   - "Ready to install — Restart Now | Later" after download completes.
4. Parse `releaseNotes` from `UpdateInfo` (string or `{version, note}[]`) and render as markdown in the "What's New" section.
5. Don't re-notify for a dismissed version until next app launch.

### P2 — Post-Hydrate Cleanup Hooks

1. Extend the `Migration` interface with an optional `postHydrate?(): void` method.
2. After `hydrateSharded()` completes, run `postHydrate()` on any migrations that were executed during this startup.
3. Track which migrations ran (by comparing schema version before and after `runMigrations`) to determine which `postHydrate` hooks to call.

## Constraints

- Follow the existing `ModuleRunner` pattern for any new main-process modules.
- Follow the existing preload `contextBridge` pattern — all IPC goes through `electronAPI`.
- All LMDB operations are synchronous (`transactionSync`, `putSync`, `removeSync`). Do NOT use async LMDB APIs.
- `qx()` and `tx()` are synchronous — do NOT await them.
- Migrations operate on raw LMDB keys (the `{t, v}` encoded format), not the in-memory EARS layer.
- The EARS layer is not hydrated when migrations run. Never import from `attribute-storage.ts` in migration code.
- Verify that `adapter.close()` is called during API server shutdown (SIGTERM handler) to flush pending LMDB writes before `quitAndInstall()`.
- Run `npm run typecheck` after each task group to catch type errors early.
- Run `npm start` to verify the app launches and the API server connects after changes.
