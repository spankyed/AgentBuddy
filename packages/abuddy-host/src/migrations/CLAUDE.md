# Migrations (`@abuddy/host/migrations`)

Data migrations that run on app startup when a stored version is behind the version being booted. The app's migrations runners live here, with the host's own migrations (`app/`, which move the app's state); the other migrations live with their packs. Host-only: packs never import this module, and the pack bridge doesn't provide it. The versions they ran to are recorded in `AppState` (`../app-state`).

## Who runs what

There are two runners, both in this folder's `index.ts` (`packages/abuddy-host/src/migrations/index.ts`). The API's boot and `services.appData.reset()` call them in this order through `startPacks()` (`../packs/runtime/start.ts`), after each pack's `onInit`; activating (install, update, enable) and reloading an external pack run `runPackMigrations` for it too:

| Runner | Runs | Runs a migration when | Records |
| --- | --- | --- | --- |
| `runAppMigrations(registry)` | the host's own (`app/index.ts`), then the built-in packs' (`registry.getRegisteredMigrations(<built-in pack ids>)`, the ids from `registry.builtInPacks()`) | `stored app version < target <= app version` (`getAppVersion()`, the bound `HostRuntime`'s `appVersion`), with the exceptions below | `AppState.version` |
| `runPackMigrations(externalPacks)` | each external pack's migrations (`LoadedPack.migrations`) | `stored pack version < target <= manifest version` | `AppState.packVersions[packId]` |

Which app migrations run, besides `stored < target`:
- **A release** runs those up to its version, once: nothing runs while the recorded version is the app's.
- **A prerelease** counts as its release: `0.3.15-beta.2` runs the `0.3.15` migrations, and runs them again whenever its version changes (`beta.1`, `beta.2`, then the release), so changes added later to the same release file reach beta users.
- **A development build** (`ABUDDY_ENV=development`) runs every pending migration, those written for later releases included, on every boot. Rule 4 below keeps that safe.

Data with no recorded version runs the host's migrations (the 0.3.15 one moves the version stored before `AppState` existed); if there's still none, it's new data at the app version, and no pack migration runs.

A migration that throws is logged (`[migration] FAILED ...`) and stops the rest: `runAppMigrations` records no version and returns `false`, and `startPacks()` then runs no external pack migration and no seed, since the versions and seed hashes they read may not be in place yet (the host's 0.3.15 moves them, and default-setup's 0.3.15 drops their old copy). The next boot retries from the failed migration. `runPackMigrations` stops a pack's migrations at a failure and doesn't record its version, so they run again the next time the pack starts. A pack that isn't loaded (disabled) keeps its recorded version.

An external pack's registration still carries its migrations (the Packs view counts them), but `getRegisteredMigrations` returns only the packs it's asked for, and `runAppMigrations` asks for the built-in ones, so a migration never runs in both.

Resetting app data runs both again: `services.appData.reset()` (`../services/app-data.ts`) runs the packs' shutdown hooks, empties the stores, then `startPacks()`. The reset emptied `AppState`, so the data counts as new: nothing is pending and the app version is recorded. Importing a backup runs them after reloading the data.

Specs: `packages/abuddy-host/tests/migrations/runner.spec.ts` (both runners, once each, versions recorded; which migrations a release, a beta and a development build run; a failure stops the rest), `tests/migrations/app-state-0.3.15.spec.ts` (the move, and the runners on data from before `AppState` on the release, a beta and a development build, and after a failed move), `tests/migrations/external-plugin-settings-0.3.15.spec.ts` (an external pack's plugin settings, run twice), `tests/services/host-runtime.spec.ts` (a reset's order; no pack migration or seed after a failed app migration) and `packages/api/tests/unit/app-reset.spec.ts` (a reset on the built-in packs).

## The host's migrations

`app/` holds the host's own migrations, which move data no pack's own migration can: the app's state, and installed external packs' stored settings; `app/index.ts` lists them, over the app's registry. `app/0.3.15.ts` moves the `internal` section of the settings (default-setup's Settings row, read untyped: it's data in the shape before 0.3.15) into `AppState`: onboarding, the version, pack versions and seed hashes, with the single `seedHash` of older versions filed under each built-in pack with a boot seed. It keeps what `AppState` already records and writes only what differs. It also moves each installed external pack's stored plugin settings, sidebar visibility and last-active plugin from its features' bare ids onto its plugins' addresses (`addressPluginSettings` from `@abuddy/sdk/framework`, which default-setup's 0.3.15 and its settings replace run for theirs); a bare id a built-in pack also has a feature by is left to that pack's migration, since the built-in plugin ran under it; a pack that isn't loaded when it runs keeps its bare keys. It runs before default-setup's 0.3.15, which drops the section. Delete it with the other migrations once 0.3.15 is below the oldest version upgrades are supported from.

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
4. **Make `up()` idempotent.** Always guard with checks (e.g. `if (!field) set(field)`) since migrations run again on every development boot, on each beta of their release, and after a database reset.
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
