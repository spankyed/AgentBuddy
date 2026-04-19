# Migrations

Settings migrations that run on app startup when the stored version is behind the app version.

## How it works

Each migration file exports a `Migration` with:
- `target` — the version this migration applies to
- `description` — short summary of changes
- `up()` — the migration function (synchronous, uses `settingsQueries` / `settingsCommands`)

`runMigrations()` in `index.ts` runs all migrations where `stored_version < target <= APP_VERSION`.

## Rules

1. **Target the next release version.** If the current release is `0.2.3`, name your migration `0.2.4.ts` with `target: '0.2.4'`. It will run once the app is released at that version.
2. **Never bump `package.json` version manually.** The release process handles version bumps. Migrations are written ahead of time.
3. **Register in `index.ts`.** Import your migration and append it to the `migrations` array in version order.
4. **Make `up()` idempotent.** Always guard with checks (e.g. `if (!field) set(field)`) since migrations can re-run after a database reset.
5. **Multiple changes per version are fine.** If the upcoming release has several schema changes, add them all to the same migration file.

## Adding a migration

```ts
// 0.X.Y.ts
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.X.Y',
  description: 'Describe what this migration does',
  up: () => {
    const data = settingsQueries.getSettings();
    // Check and apply changes...
  }
};
```

Then in `index.ts`:
```ts
import { migration as m0XY } from './0.X.Y';
// append to migrations array
```
