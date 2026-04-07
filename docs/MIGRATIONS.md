# Data Migrations

## How It Works

Migrations run once during backend startup, after LMDB is hydrated and default settings are created, but before any systems spawn.

```
Startup sequence:
  hydrateSharded()       ← LMDB loaded
  createDefaultSettings() ← Settings entity ensured
  runMigrations()        ← Migrations run here
  seedData()             ← Compiled DSL loaded
  backendActor.start()   ← Systems spawn
```

### Version tracking

- `APP_VERSION` is sourced from the root `package.json` — single source of truth
- Each user's `internal.version` (stored in LMDB settings) tracks which app version their data has been migrated to
- After all pending migrations run, `internal.version` is stamped to the current `APP_VERSION`
- New installs start at `APP_VERSION` (via settings defaults), so no migrations run

### Migration execution

```typescript
for (const m of migrations) {
  if (m.target > current) {  // strict greater-than
    m.up();
  }
}
```

- `m.target`: the app version that introduced this migration (e.g., `'0.1.0'`)
- `current`: the user's stored `internal.version`
- Strict `>` ensures a migration runs exactly once — when the stored version is less than the target
- Migrations must be **idempotent** (safe to run even if the data is already in the expected state)

## Adding a New Migration

1. Create `packages/api/src/setup/migrations/<version>.ts`:

```typescript
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';

export const migration = {
  target: '0.2.0',  // the app version this ships with
  description: 'Brief description of what this migration does',
  up: () => {
    // Migration logic here
    // Use settingsQueries/settingsCommands for settings
    // Use qx()/tx() for EARS entities
  },
};
```

2. Register it in `index.ts`:

```typescript
import { migration as m020 } from './0.2.0';

const migrations: Migration[] = [m010, m020];  // maintain version order
```

3. Bump `package.json` version to match (via `build/release/release.sh`)

## Existing Migrations

| Version | File | Description |
|---------|------|-------------|
| 0.1.0 | `0.1.0.ts` | Migrate agent plugin settings to `threads.chat`, update stale `lastActivePlugin` |

## Frontend Migrations

A parallel system exists for localStorage migrations at `packages/renderer/src/setup/migrations/`. Same pattern — versioned files, runs before the application actor is created.
