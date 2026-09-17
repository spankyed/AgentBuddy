```
# Goal: database operations through the abuddy CLI

Implement docs/goals/goal-abuddy-db-cli.md on a branch cut after docs/goals/goal-package-boundaries.md
(which absorbed the engine-instance goal) has landed. Read Background, Decisions, Phases and
Constraints first. Decision 2 must be settled before starting; if it's still marked open, stop and ask. Where
another detail isn't specified, pick the conventional option, note it in the final summary, and keep going.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard or test is mutation-checked.
- `abuddy db` covers every maintained operation of packages/api/scripts/db, and those scripts are gone or thin.
- No test or manual run opens a real data dir (~/Library/Application Support/abuddy*); all use temp
  ABUDDY_USER_DATA_DIRs.
- `npm run typecheck`, `npm run typecheck -w @app/main`, `schema:check`, `api:check` (sdk, ui), `packages:build`
  + `packages:check`, `facade:check -w @app/default-setup`, and the api, sdk, host, cli, default-setup and
  renderer unit suites pass.
- `npm run build`, the monorepo E2E, `npm run test:external-pack` and `npm run test:packaged-authoring` pass.
- A final summary: phase → done, evidence, conventional choices.

Never:
- commit, stage, push or tag unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows.
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir; run
  packages/api/scripts/db/fix-prod-upgrade.ts.
- pkill/killall Electron or node; run bare tsc on packages/preload; edit version/release metadata.
- add backward-compat shims or loosen a failing assertion instead of investigating.
```

## Background

Database operations live in `packages/api/scripts/db` and run through `npm run db:*` in the monorepo:
- **Scripts:** `cli/run-db-cli.ts` (REPL, `-e` exec, `-s` script), `reset.ts`, `seed.ts`, `import-backup.ts`, `export-json.ts`/`export-data.ts`/`export.sh`, `destroy-settings.ts` (dry run by default, `--force`), `inspect-relations.ts`, `cleanup-settings.ts`, and a one-off (`fix-prod-upgrade.ts`).
- **Env:** every script needs `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR`.

**Why they can't move to `@abuddy/cli` today:** they boot the app's database through `scripts/db/database.ts`, which uses the API's composition root, `openAppStore()` (`@/setup/backend`: the pack registry, the LMDB store, the engine and the `bindHost` binding), and loads the built-in packs with `loadBuiltInPacks` (`@abuddy/host/packs/runtime`). The CLI ships as a bundled `dist/package` used outside the monorepo, so it can't depend on `@app/api`.

**What `goal-package-boundaries.md` already gave this goal** (it absorbed `goal-ears-engine-instance.md`):
- The engine is an instance: `createEarsEngine({ persistence, isEntityType })` (`@abuddy/ears`), with a `query` face packs use and an `admin` face for hydration, clearing and direct writes.
- The LMDB store is public: `openLmdbStore({ paths, policy, engine })` (`@abuddy/ears/lmdb`) opens, hydrates, queries and resets it, with no import side effect. The partition policy comes from a pack registry (`createPackRegistry()`, `@abuddy/host/packs`).
- So a process can open an app's database with published `@abuddy/ears` exports and host modules; what's missing is the composition outside the API (Decision 3).

**What exists to build on:**
- **Data folders:** `resolveAppContext({ env })` (`@abuddy/sdk/env`) gives each environment's `userDataDir`, `packsDir`, `hostPacksDir` and `apiPortFile`. The CLI's `install`/`uninstall`/`list`/`open` already select production by default, with `-d`/`-b` for development/beta.
- **Running app detection:**
  - The API writes its port to `apiPortFile` while it runs and removes it on shutdown (`packages/api/src/setup/websocket.ts`).
  - `abuddy dev` reads the file to call the running API (`POST /dev/reload`, `packages/abuddy-cli/src/commands/dev.ts`).
  - Electron keeps `SingletonLock` (`<host>-<pid>`) in the data dir; `fix-prod-upgrade.ts` `assertAppQuit` shows the check.
- **Executors and data services:**
  - The Database plugin's executors: read-only queries (`packages/default-setup/src/features/database/be/execute/query.ts`) and transactions (`execute/transaction.ts`).
  - Host data services: `services.appData.reset`/`exportBackup`/`importBackup`, `services.traceStore`.
- **Entity types per data dir:** an installed app's packs are on disk.
  - Built-in packs are published to `hostPacksDir` with their snapshot.
  - External packs sit in `packsDir` with `abuddy.json` and `types/snapshot.json`.
  - Their manifests give the entity types, relation kinds and partition policy that hydration needs, without running pack code.
- **Version:** the data records the app version it was migrated to (`AppState.version`, `@abuddy/host/app-state`), and `readHostVersion(userDataDir)` (`@abuddy/host/packs`) reads the version of the app that last ran on the data dir (`host.json`).

## Decisions

1. **`abuddy db` is a CLI command group.**
   - **Commands:** `abuddy db query|exec|inspect|export|import|reset|clear-settings`.
   - **Target:** production by default, `-d`/`-b` for development/beta, as `install` does, plus `--data-dir <path>` for a copy of user data.
   - **Output:** every command prints the data dir it targets before acting.
2. **While the app is running on the target data dir** (OPEN, decide before starting). The API holds the whole database in memory and is its only writer, so a second process writing the files while the app runs loses its writes or overwrites the app's. Choose one:
   - **A. Offline only.**
     - The CLI always opens the files itself.
     - Writing commands (`exec`, `import`, `reset`, `clear-settings`) refuse while the app runs on that data dir.
     - Reads are allowed, with a warning that they may be stale.
     - No API changes.
   - **B. Through the app when it runs, offline otherwise.**
     - When `apiPortFile` names a live API, commands go to new API endpoints that use the Database plugin's executors and `services.appData`, so the app stays the single writer and sees the change immediately.
     - When it doesn't, the CLI opens the files.
     - If the Electron lock is held but no API port is published (starting, or crashed), writes refuse.
     - Needs authenticated local endpoints (Decision 5).
3. **Offline access is a host module.**
   - **`openAppDatabase({ userDataDir, readOnly })`** in `@abuddy/host`, built on `createEarsEngine` and `openLmdbStore` (`@abuddy/ears/lmdb`):
     - reads the installed packs' manifests for entity types, relation kinds and partition policy;
     - hydrates exactly as the API boots;
     - returns `{ query, admin, close }`, where `close` flushes and reports a failed flush as an error, not a log line.
   - **The API and the CLI both use it,** so there is one hydration path.
4. **Version check.**
   - Opening a data dir compares the app version the data records with the version range the CLI supports (the CLI's own version, with its major.minor). A mismatch refuses, naming both versions.
   - `--ignore-version` exists only for read commands.
   - The CLI copy bundled inside the app always matches.
5. **Local endpoints are authenticated (if Decision 2 is B).**
   - The API binds loopback only, and writes a random token next to `apiPortFile` (`api-token`, mode 0600, removed on shutdown).
   - Every db endpoint requires it.
   - The existing `/dev/reload` adopts the same token.
6. **Destructive commands are dry runs by default.**
   - `reset`, `import` and `clear-settings` list what they would change and need `--force` to act, as `db:clearSettings` does today.
   - `import` validates the backup first.
7. **Queries run the Database plugin's rules.**
   - `db query` runs read-only EARS query code with the same read helpers as the Database console.
   - `db exec` runs transaction code with the console's transaction helpers.
   - The two share the executors, whether run offline or through the app, so a query means the same thing everywhere.
8. **The monorepo scripts go.**
   - Maintained operations move into `abuddy db`, and the `npm run db:*` scripts call the CLI with the monorepo's development data dir, or are removed.
   - The one-off scripts are deleted, not ported (`cli/cleanup-tombstoned`, `cleanup-corrupt-data`, `cleanup-export-subdoclinks` and `migrate-tnodes` are already gone).
   - `fix-prod-upgrade.ts` is deleted once the user has run it; confirm with the user before deleting it.
   - The db CLI README becomes a section of `docs/public-facing/cli.md`.

## Phases

### Phase 1 — Offline database access in `@abuddy/host`
- `openAppDatabase` (Decision 3), plus the helpers for installed packs' EARS policy (from `hostPacksDir` snapshots and `packsDir` manifests), the version check (Decision 4) and running-app detection (`apiPortFile` liveness plus the `SingletonLock` pid, where ESRCH means not running).
- **The API boots through `openAppDatabase`'s hydration path.** Its own boot keeps its order: hydrate, then `onInit`, migrations and seeds.
- **Tests on temp data dirs:**
  - a dir written by the API's boot in tests opens and queries identically;
  - an external pack's entity types come from its manifest;
  - a version mismatch refuses;
  - a failed flush on `close` throws;
  - a live pid or port counts as running, and a dead pid and stale port file don't.

**Done when:** the API and a standalone process hydrate a data dir to the same entities, relations and roles (asserted by a test comparing snapshots). No production code imports API internals to open a database.

### Phase 2 — App endpoints (only with Decision 2 = B)
- **Token:** loopback-only binding, and the `api-token` file (Decision 5).
- **Endpoints:**
  - `db.query` and `db.exec` (Database plugin executors);
  - `db.export` (entities, relations and roles as JSON or CSV);
  - `db.import`, `db.reset` and `db.clearSettings` through `services.appData` and the settings repository, with dry-run results.
- **After a write through the app,** plugins are refreshed the way the Database console's writes refresh them today.
- **Tests:**
  - a missing or wrong token is rejected;
  - a write through the endpoint is visible to the running systems;
  - a reset through the endpoint matches Settings → Reset app.

**Done when:** each endpoint is covered, including rejection without the token. `/dev/reload` requires the token, and `abuddy dev` sends it.

### Phase 3 — `abuddy db` commands
- **Commands** in `packages/abuddy-cli/src/commands/db/`:
  - `query <code|--file>` and `exec <code|--file>`, both with `--output json|csv|pretty` and `--out <file>`;
  - `inspect <entity-id> [--incoming] [--outgoing] [--depth n]`;
  - `export [--type <Entity>...] --out <dir>`;
  - `import <backup-dir> [--force]`;
  - `reset [--force]`;
  - `clear-settings [--force]`;
  - `-d`/`-b`/`--data-dir` and `--ignore-version` (reads only).
- **Routing** follows Decision 2. Each command prints the target data dir and whether it went through the app or offline.
- **Packaging:**
  - add `lmdb` to `@abuddy/cli`'s published dependencies;
  - keep it external in the CLI bundle;
  - `packages:check` passes.
- **Tests:**
  - every command against a temp data dir, offline;
  - with Decision 2 = B, the same commands against an app started by the test harness through the endpoints;
  - refusal while the app runs (Decision 2 = A) or when the lock is held without a port (B);
  - dry-run output;
  - the version mismatch.

**Done when:** each command and routing path is covered and mutation-checked.

### Phase 4 — Retire `packages/api/scripts/db`
- **Maintained scripts:** delete the maintained scripts `abuddy db` now covers. `npm run db:*` either call the CLI against the monorepo's development data dir, or are removed; update root and `packages/api` `package.json`.
- **One-off scripts:** delete them (Decision 8). Ask the user before deleting `fix-prod-upgrade.ts`.
- **Tests:** move the scripts' specs to the CLI and host specs or delete them: `destroy-settings.spec.ts`, `inspect-relations.spec.ts` and `run-db-cli-args.spec.ts` in `packages/api/tests/unit`.
- **Docs:**
  - `docs/public-facing/cli.md` gains a "Database" section: commands, the target data dir, running-app behaviour, dry runs, version check and backups.
  - Delete `packages/api/scripts/db/cli/README.md`.
  - Update root `CLAUDE.md` (Commands: `db:cli`/`db:reset`) and `packages/api/CLAUDE.md` if present.

**Done when:** `packages/api/scripts/db` holds nothing `abuddy db` covers, and no doc refers to the removed scripts.

### Phase 5 — Packaged use
- **`test:packaged-authoring`** runs `abuddy db query` and `abuddy db export` from the packed CLI tarball against a temp data dir. The installed demo pack seeds that dir through the test-harness app. It also checks the version refusal with a data dir that records a different app version.
- **E2E** (monorepo): with the app running in the test environment, `abuddy db query --data-dir <worker dir>` reads the app's data. Under B, `db exec` writes a row the renderer then shows; under A, the command refuses.

**Done when:** both pass, and every item in "Finished when" passes.

## Constraints

- Tests and manual runs only use temp `ABUDDY_USER_DATA_DIR`s with `ABUDDY_ENV=test`; never real data dirs. Don't launch the app outside the test environment without an isolated data dir.
- Never commit, stage, push or tag unless the user asks in the session. Never publish or trigger workflows.
- Never use broad pkill/killall on Electron or node. Never run bare tsc on `packages/preload`. Don't edit version/release metadata.
- No backward-compat shims: the `npm run db:*` scripts change or go directly. No polling or hacky workarounds. Mutation-check every new guard and test; investigate failures before changing assertions.
- Pack-facing API reports stay unchanged except for additions this goal needs, recorded with `npm run api:update`.
