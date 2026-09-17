# Migrations (`@abuddy/host/migrations`)

Data migrations that run on app startup when a stored version is behind the version being booted. The app's migrations runners live here, with the host's own app migrations (`app/`, which move the app's state); the other migrations live with their packs. Host-only: packs never import this module, and the pack bridge doesn't provide it. The versions they ran to are recorded in `AppState` (`../app-state`).

## Who runs what

There are two runners, both in this folder's `index.ts` (`packages/abuddy-host/src/migrations/index.ts`). The API's boot (`packages/api/src/setup/backend.ts`) calls them in this order, after each pack's `onInit`:

| Runner | Runs | Runs a migration when | Records |
| --- | --- | --- | --- |
| `runAppMigrations(registry)` | the host's app migrations (`appMigrations(registry)`, `app/index.ts`), then the built-in packs' migrations (`registry.getRegisteredMigrations(<built-in pack ids>)`, the ids from `getBuiltInPackInfos()`) | `stored app version < target <= app version` (`getAppVersion()`, the bound `HostRuntime`'s `appVersion`) | `AppState.version` |
| `runPackMigrations(externalPacks)` | each external pack's migrations (`LoadedPack.migrations`) | `stored pack version < target <= manifest version` | `AppState.packVersions[packId]` |

Data with no recorded version runs the host's app migrations first (they move a version stored before `AppState` existed); if it still has none, it's new data at the app version, and no pack migration runs.

A migration that throws is logged (`[migration] FAILED ...`). `runAppMigrations` goes on with the next one and records the version; `runPackMigrations` stops that pack's migrations and doesn't record its version, so they run again at the next boot.

An external pack's registration still carries its migrations (the Packs view counts them), but `getRegisteredMigrations` returns only the packs it's asked for, and `runAppMigrations` asks for the built-in ones, so a migration never runs in both.

Resetting app data runs `runAppMigrations(registry)` again: `services.appData.reset()` (`../services/app-data.ts`) runs it last, after each pack's `onInit` and boot seed. The reset emptied `AppState`, so the data counts as new: nothing is pending and the app version is recorded.

Specs: `packages/abuddy-host/tests/migrations/runner.spec.ts` (both runners, once each, versions recorded), `tests/migrations/app-state-0.3.15.spec.ts` (the host's 0.3.15 migration and the runner on data from before `AppState`), `tests/services/host-runtime.spec.ts` (a reset's order) and `packages/api/tests/unit/app-reset.spec.ts` (a reset on the built-in packs).

## Host app migrations

`app/` holds the migrations of what no pack owns: the app's state. Each file is a `PackMigration` named after its target, listed in `app/index.ts`, with the same rules as below. `app/0.3.15.ts` (a migration over the app's registry, `migration(registry)`) moves the `internal` section of the settings (default-setup's Settings row, read untyped as old data) into `AppState`: onboarding, the version, pack versions and seed hashes, with the single `seedHash` of older versions filed under each built-in pack with a boot seed. It keeps what `AppState` already records and writes only what differs; default-setup's own 0.3.15 migration then drops the section from its settings.

## Built-in migrations

default-setup's migrations are files in `packages/default-setup/src/migrations/`, listed in that folder's `index.ts` (`packages/default-setup/src/migrations/index.ts`) and registered through the pack's registration (its `abuddy.json` `migrations`). Each file exports a `PackMigration` with:
- `target` — the version this migration applies to
- `description` — short summary of changes
- `up()` — the migration function (synchronous, uses the pack's repositories, e.g. `settingsQueries` / `settingsCommands`)

The release script (`build/release/release.sh`) checks that a release changing `default-settings.ts` has a migration file for its version in that folder.

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
