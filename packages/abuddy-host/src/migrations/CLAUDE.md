# Migrations (`@abuddy/host/migrations`)

Data migrations that run on app startup when a stored version is behind the version being booted. The app's migrations runners live here, with the host's own migrations (`app/`, which move the app's state); the other migrations live with their packs. Host-only: packs never import this module, and the pack bridge doesn't provide it. The versions they ran to are recorded in `AppState` (`../app-state`).

A window's own storage has its counterpart, `src/fe/migrations/` (`runFrontendMigrations`, exported from `@abuddy/host/fe`): the same shape — versioned files, listed in order, each idempotent — over the storage a window passes in, recorded under `agentbuddy-fe-version` rather than in `AppState`, since no app is bound when they run. They are not hooked up to packs.

## Who runs what

There are two runners, both in this folder's `index.ts` (`packages/abuddy-host/src/migrations/index.ts`). The API's boot and `services.appData.reset()` call them in this order through `startPacks()` (`../packs/runtime/start.ts`), after each pack's `onInit`; activating (install, update, enable) and reloading an external pack run `runPackMigrations` for it too:

| Runner | Runs | Runs a migration when | Records |
| --- | --- | --- | --- |
| `runAppMigrations(registry)` | the host's own (`app/index.ts`), then every registered pack's **`app`**-line migrations (`registry.packMigrationTargets('app')`) | `stored app version < target <= app version` (`getAppVersion()`, the bound `HostRuntime`'s `appVersion`), with the exceptions below | `AppState.version` |
| `runPackMigrations(targets)` | every registered pack's **`pack`**-line migrations (`registry.packMigrationTargets('pack')`) | `stored pack version < target <= manifest version` | `AppState.packVersions[packId]` |

**Which runner gets a migration is what its pack declared, not where the pack came from.** A pack files each
migration under a version line in `abuddy.json` — `migrations.app` or `migrations.pack` (`MIGRATION_LINES`,
`@abuddy/sdk/build`) — because a bare version does not say what it is a version of. Routing on provenance
instead is the trap: it makes one `0.3.15` mean the app's release in a pack the app ships and the pack's own
version in every other, so a user's build installed at a shipped pack's id has its migrations compared
against the wrong thing. So a pack the app ships may be on either line, an external pack may be on either,
and **a pack declaring both gets both** — at the two moments the runners run, which is the one thing to know
before splitting a single change across them: don't.

Which app migrations run, besides `stored < target`:
- **A release** runs those up to its version, once: nothing runs while the recorded version is the app's.
- **A prerelease** counts as its release: `0.3.15-beta.2` runs the `0.3.15` migrations, and runs them again whenever its version changes (`beta.1`, `beta.2`, then the release), so changes added later to the same release file reach beta users.
- **A development build** (`ABUDDY_ENV=development`) runs every pending migration, those written for later releases included, on every boot. Rule 4 below keeps that safe.

Data with no recorded version runs the host's migrations (the 0.3.15 one moves the version stored before `AppState` existed); if there's still none, it's new data at the app version, and no pack migration runs.

A migration that throws is logged (`[migration] FAILED ...`) and stops the rest: `runAppMigrations` records no version and returns `false`, and `startPacks()` then runs no external pack migration and no apply, since the versions and content hashes they read may not be in place yet (the host's 0.3.15 moves them, and default-setup's 0.3.15 drops their old copy). The next boot retries from the failed migration. `runPackMigrations` stops a pack's migrations at a failure and doesn't record its version, so they run again the next time the pack starts. A pack that isn't loaded (disabled) keeps its recorded version.

A migration never runs in both runners, because the map it was declared in is the one `packMigrationTargets` answers for. The Packs view's `migrationCount` counts both lines, being what the pack declares rather than what one runner reaches.

**What the app line cannot say, and the edit that makes it matter.** `AppState.version` is one recorded
version for every pack, so the app line cannot express *this pack is behind on it*. Two consequences, and
only one of them is a gap:

- **A pack installed or enabled at runtime needs nothing**, which is why activation and reload run
  `runPackMigrations` alone. A pack arriving now has no data from before now, and its app-line migrations
  become live at the next boot after AgentBuddy moves, which is exactly when an app-line migration should
  fire.
- **A pack disabled across an app upgrade and enabled afterwards never runs its app-line migrations.** The
  boot that upgraded did not have it registered, and enabling it later reaches only the pack line; on a
  release build `runAppMigrations` then returns at once, since the recorded version is already the app's.
  The pack line has no such hole, because `AppState.packVersions[id]` is per pack and survives being
  disabled.

That second one **cannot happen today**: the only packs on the app line are ones the app ships, and those
cannot be disabled (`features/packs/be/system.ts` refuses it). It becomes reachable the moment an external
pack declares `migrations.app`, and the fix is a per-pack app-line record beside `packVersions` — a stored
field, so a deliberate decision rather than something to add in passing.

Resetting app data runs both again: `services.appData.reset()` (`../services/app-data.ts`) runs the packs' shutdown hooks, empties the stores, then `startPacks()`. The reset emptied `AppState`, so the data counts as new: nothing is pending and the app version is recorded. Importing a backup runs them after reloading the data.

Specs: `packages/abuddy-host/tests/migrations/runner.spec.ts` (both runners, once each, versions recorded; which migrations a release, a beta and a development build run; a failure stops the rest), `tests/migrations/app-state-0.3.15.spec.ts` (the move, and the runners on data from before `AppState` on the release, a beta and a development build, and after a failed move), `tests/migrations/plugin-settings-0.3.15.spec.ts` (the app shell's state out of the settings' `_meta` into `AppState`, and the host's and an external pack's plugin settings, run twice; the packs installed on disk read from a data dir), `tests/services/host-runtime.spec.ts` (a reset's order; no pack migration or apply after a failed app migration) `packages/api/tests/runtime/app-reset.spec.ts` (a reset on the built-in packs) and `packages/api/tests/runtime/upgrade-from-0.3.14.spec.ts` (the host's and the built-in pack's 0.3.15 over a 0.3.14 settings row).

## The host's migrations

`app/` holds the host's own migrations, which move data no pack's own migration can: the app's state, and every pack's stored plugin settings; `app/index.ts` lists them, over the app's registry. `app/0.3.15.ts` moves the `internal` section of the settings (default-setup's Settings row, read untyped: it's data in the shape before 0.3.15) into `AppState`: onboarding, the version, pack versions and content hashes, with the single `contentRevision` of older versions filed under each built-in pack with a boot apply. It keeps what `AppState` already records and writes only what differs. It also moves the app shell's state out of the settings (`plugins._meta`: which tabs show, the plugin last open) into `AppState`, each id onto its feature's ref and one no installed pack has dropped, as is a tab still at 0.3.14's default (0.3.14 stored every default, so those were no choice of the user's); and every pack's stored settings onto their refs, before any pack's migration reads them. Whose a bare id is follows one rule (`PluginOwners`): the feature with that id, and of several, the built-in pack's, which ran under it before 0.3.15. The features are every registered system and plugin plus every feature an installed pack's `abuddy.json` lists, because the migration runs once: a pack disabled at that boot, or an old build that no longer loads, would otherwise keep its keys bare for good. A manifest on disk is read as data: a malformed one lists no features, because a thrown migration would stop every boot's migrations and content. A plugin settings key no installed pack owns, or that two external packs share, is dropped: the app reads plugin settings only by ref, and the settings refuse a bare key. It runs before default-setup's 0.3.15, which drops the section. Delete it with the other migrations once 0.3.15 is below the oldest version upgrades are supported from.

## Built-in migrations

default-setup's migrations are files in `packages/default-setup/src/migrations/`, each named in its `abuddy.json` under `migrations.app` — **the app's line**, which is why they are named for AgentBuddy's releases (`0.3.15.ts`) while the pack's own `version` is `0.1.0` and compared to nothing. There is no index module: the manifest is the list, and a file no manifest names runs never.

Each file exports a `DeclaredMigration` (`@abuddy/sdk/framework`) with:
- `description` — short summary of changes
- `up()` — the migration function (synchronous, uses the pack's repositories, e.g. `settingsQueries` / `settingsCommands`)

**It does not state its target.** The manifest key is the version, and codegen assembles the
`PackMigration { target, description, up }` the runners take from the two. Two sources for one fact is what
that avoids: a `target` in the file and a version in the filename could disagree, and nothing read the
filename. The modules beside them that are not migrations (`bare-feature-ids.ts`, `defaults-0.3.14.ts`,
which `0.3.15.ts` imports) are simply unnamed in the manifest.

The release script (`build/release/release.sh`) checks that a release changing `default-settings.ts` has a migration file for its version in that folder.

## Rules

1. **Target the next release version.** If the current release is `0.2.3`, name your migration `0.2.4.ts` and key it `"0.2.4"` under `migrations.app`. It runs once the app is released at that version.
2. **Never bump `package.json` version manually.** The release process handles version bumps. Migrations are written ahead of time.
3. **Declare it in `packages/default-setup/abuddy.json`**, under `migrations.app`, keyed by the version it targets: `"0.2.4": "src/migrations/0.2.4.ts#migration"`. `abuddy add migration 0.2.4 --app` writes both the entry and the file. Then `npm run compile`, which regenerates the pack entry the runners read.
4. **Make `up()` idempotent.** Always guard with checks (e.g. `if (!field) set(field)`) since migrations run again on every development boot, on each beta of their release, and after a database reset.
5. **Multiple changes per version are fine.** If the upcoming release has several schema changes, add them all to the same migration file.

**Which line a pack's migration belongs on**, for a pack that is not this one: `pack`, unless the data's
shape follows AgentBuddy's rather than the pack's. `pack` is `abuddy add migration`'s default for that
reason, and it is the line a pack author's own versions are on. `app` is a real capability and not a
mistake — a pack whose rows mirror the app's own has a reason — but it puts a third party's code on
AgentBuddy's version line, so it deserves a deliberate `--app` rather than arriving by default.

## Adding a migration

```ts
// packages/default-setup/src/migrations/0.X.Y.ts
import { repository } from '#generated/repository.ts';
import type { DeclaredMigration } from '@abuddy/sdk/framework';

export const migration: DeclaredMigration = {
  description: 'Describe what this migration does',
  up: () => {
    const data = repository.settingsQueries.getSettings();
    // Check and apply changes...
  },
};
```

Then in `packages/default-setup/abuddy.json`, under the app's line:
```json
"migrations": { "app": { "0.X.Y": "src/migrations/0.X.Y.ts#migration" } }
```
