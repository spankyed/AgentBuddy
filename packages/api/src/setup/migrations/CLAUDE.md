# Migrations

Settings migrations that run on app startup when a stored version is behind the version being booted.

## Who runs what

Migrations live with their pack. There are two runners, both in this folder's `index.ts` (`packages/api/src/setup/migrations/index.ts`), called in this order at boot (`packages/api/src/setup/backend.ts`):

| Runner | Runs | Runs a migration when | Records |
| --- | --- | --- | --- |
| `runMigrations()` | the built-in packs' migrations (`getRegisteredMigrations(<built-in pack ids>)`) | `stored app version < target <= APP_VERSION` | internal settings `version` |
| `runPackMigrations(externalPacks)` | each external pack's migrations (`LoadedPack.migrations`) | `stored pack version < target <= manifest version` | internal settings `packVersions[packId]` |

An external pack's registration still carries its migrations (the Packs view counts them), but `getRegisteredMigrations` returns only the packs it's asked for, and `runMigrations` asks for the built-in ones, so a migration never runs in both. Resetting app data runs `runMigrations()` again.

## Built-in migrations

default-setup's migrations are files in `packages/default-setup/src/migrations/`, listed in that folder's `index.ts` (`packages/default-setup/src/migrations/index.ts`) and registered through the pack's registration (its `abuddy.json` `migrations`). Each file exports a `PackMigration` with:
- `target` — the version this migration applies to
- `description` — short summary of changes
- `up()` — the migration function (synchronous, uses `settingsQueries` / `settingsCommands`)

## Rules

1. **Target the next release version.** If the current release is `0.2.3`, name your migration `0.2.4.ts` with `target: '0.2.4'`. It will run once the app is released at that version.
2. **Never bump `package.json` version manually.** The release process handles version bumps. Migrations are written ahead of time.
3. **List it in `packages/default-setup/src/migrations/index.ts`.** Import your migration and append it to the `migrations` array in version order.
4. **Make `up()` idempotent.** Always guard with checks (e.g. `if (!field) set(field)`) since migrations can re-run after a database reset.
5. **Multiple changes per version are fine.** If the upcoming release has several schema changes, add them all to the same migration file.

An external pack's migrations target that pack's own versions, not the app's.

## Adding a migration

```ts
// packages/default-setup/src/migrations/0.X.Y.ts
import { repository } from '@/__generated__/repository';
import type { PackMigration } from '@abuddy/sdk/framework';

export const migration: PackMigration = {
  target: '0.X.Y',
  description: 'Describe what this migration does',
  up: () => {
    const data = repository.settingsQueries.getSettings();
    // Check and apply changes...
  },
};
```

Then in `packages/default-setup/src/migrations/index.ts`:
```ts
import { migration as m0XY } from './0.X.Y';
// append to the migrations array
```
