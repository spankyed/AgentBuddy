> **Written in session** `c9f31de2-e94c-46ea-a2ac-2898390dc27d` (Claude Code, 2026-09-22). Resume it with `claude -r c9f31de2-e94c-46ea-a2ac-2898390dc27d`.

```
# Goal: settings is the app's, not a pack's — the store and system in @abuddy/host, the views in the renderer

Implement docs/goals/goal-settings-to-host.md, at or after 6d0633ad4 — the
base its Background was surveyed at.
Before Phase 1, confirm the base: packages/default-setup/src/features/settings/{document.ts,be/repository/index.ts,be/system.ts,be/services/settings.ts},
packages/abuddy-host/src/features/{registration.ts,packs/be/system.ts,packs/fe/machine.ts},
packages/renderer/src/views/packs/plugin.ts and packages/abuddy-host/src/app-state/index.ts exist at HEAD.
If they don't, stop and say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The Open decisions must be settled with the user before the phase each names;
if any is still marked open when you reach it, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- packages/default-setup/src/features/settings/ no longer exists, and `settings` is gone from
  default-setup's abuddy.json features, entities and services.
- The Settings entity is declared by the host (HOST_ENTITY_TYPES) and no pack may declare it.
- `services.settings` is a host service, named in HOST_SERVICE_NAMES, implemented in
  packages/abuddy-host/src/services/settings.ts.
- The settings plugin runs at `host/settings`, its machine in packages/abuddy-host/src/features/settings/fe/
  and its Vue in packages/renderer/src/views/settings/, registered through `hostFrontend`.
- A feature reads and writes its own settings without importing anything from default-setup.
- npm run typecheck, npm run schema:check, api:check (sdk), facade:check -w @app/default-setup,
  packages:build + packages:check.
- npm run test:unit, npm run compile, npm run build, npm test (E2E), npm run test:external-pack,
  npm run test:packaged-authoring; npm start boots clean and Settings opens with every tab working.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files. Check `git diff --cached` first.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- move a per-feature settings form (features/<id>/fe/settings.vue) or a feature's own settings.ts
  defaults out of default-setup — those are the pack's content (Decision 3).
- teach @abuddy/host the shape of `general` or `assistant` (Decision 2: sections are opaque to the host).
- leave the settings system's non-settings jobs in it (Decision 5).
```

## Background (2026-09-22, at 6d0633ad4 on AS/frontend-host-boundary)

### Why settings is being moved

Settings is a cross-cutting concern owned by a pack feature, so every other feature couples to that
feature to read or write its own settings. Two consequences found while planning
[`goal-plugin-inbox.md`](goal-plugin-inbox.md):

- `packages/default-setup/src/features/code/fe/features/explorer/ExplorerPanel.vue:201` reads
  `usePluginSettings<CodeSettings>('code')` — the `code` feature reading **its own** settings out of the
  settings *plugin's* actor, with a hand-supplied type parameter, while `code/fe/state.ts:770` already
  handles `FEATURE_SETTINGS_UPDATED` typed as `CodeSettings`. Redundant.
- `packages/default-setup/src/features/browser/fe/state.ts:317` calls `currentPluginSettings('browser')`
  **inside a machine action**, because `browser` is the one feature of ten that never handles
  `FEATURE_SETTINGS_UPDATED` and so has no settings of its own to read.

Both are symptoms of the same thing: there is no app-level way to reach a feature's own settings.

### What is already the host's

| concern | owner today |
|---|---|
| which features may have settings; declared defaults; merge, revision, listeners | **host** — `createSettingsDefaultsStore()` (`packs/backend-extensions.ts`), `featuresWithSettings()` (`packs/registry.ts`) |
| the event every plugin receives | **SDK** — `FeatureSettingsUpdated`, in `PLUGIN_EVENT_TYPES` (`events/index.ts:30`) |
| stored values, read/write, the service | **default-setup** — `services.settings` is a *pack* service (`features[].services` on `settings`), not one of the eight `HOST_SERVICE_NAMES` |
| the UI | **default-setup** |

So the registry half is host's already. Note also `FeatureSettingsUpdated.settings: unknown`, which is why
every consumer hand-supplies a type.

### The template this follows

`host/packs` is already split exactly the way this goal splits settings:

```
packages/abuddy-host/src/features/packs/be/system.ts     the backend system
packages/abuddy-host/src/features/packs/fe/machine.ts    the plugin's machine, no Vue
packages/abuddy-host/src/features/packs/fe/public.ts     what it offers other frontend code
packages/renderer/src/views/packs/{plugin.ts,canvas.vue,PackDetail.vue,SectionHeader.vue}
```

`packages/renderer/src/views/packs/plugin.ts` pairs them and is where the host's frontend registration
lives:

```ts
const packsPlugin: PluginDefinition = { label: 'Packs', icon: Package, state: packsMachine, canvas, isPinned: true };
export const hostFrontend: PackFERegistration = { id: HOST_PACK_ID, features: { packs: { plugin: packsPlugin } } };
```

`packages/abuddy-host/src/features/index.ts` is the one import the API composes the host's registration
from. Settings adds a third feature beside `application` and `packs`.

### What is in the settings feature today

`packages/default-setup/src/features/settings/`, 863 lines of backend plus the views:

| file | lines | what |
|---|---|---|
| `be/system.ts` | 400 | the system — and four jobs that aren't settings (below) |
| `be/types.ts` | 199 | `SettingsData`, and every per-plugin settings interface |
| `be/repository/index.ts` | 170 | the store: stored vs effective, the one `write()`, listeners, `whileReplacingData` |
| `be/defaults.ts` | 40 | reads default-setup's compiled `settings.seed.json`, merges `getPackSettingsDefaults()` |
| `be/services/settings.ts` | 45 | `SettingsService`: `getAll`, `getPluginSettings`, `getGeneralSettings`, `updatePluginSetting` |
| `be/faqs.ts` | 9 | reads default-setup's compiled `faqs.seed.json` |
| `document.ts` | 107 | pure: `setIn`, `removeIn`, `changesFrom`, `isEqual`, `settingsProblems`, `SettingsRefusedError`, `SETTINGS_KIND` |
| `settings.ts`, `plugin-settings.ts`, `constants.ts` | — | the feature's own defaults; reading a slice by name; UI URLs |
| `fe/**` | — | the plugin, its machine, and the canvas/tabs/components |

**`document.ts` depends only on `@abuddy/sdk/ids` and `@abuddy/sdk/utils/pure`** — it moves as-is.

**The store depends on** `@/__generated__/ears` (`tx`, `qx`, `EARS`), `../types`, `../defaults`,
`@abuddy/sdk/utils/pure`, `@abuddy/sdk/ids` and `@abuddy/sdk/framework`'s `getFeaturesWithSettings`. The
host's equivalent of the first is `import { tx, untypedQx } from '@abuddy/ears'`, as
`packages/abuddy-host/src/app-state/index.ts` does.

### The settings system is four jobs, not one

`be/system.ts`'s incoming events:

- **settings** — `GET_SETTINGS`, `UPDATE_SETTINGS`, `RESET_SETTINGS`, `REPLACE_SETTINGS`
- **CLI provider testing** — `TEST_CLI_PROVIDER`, importing `testCli`/`isCliName`/`clearCliPathCache` from
  `@/features/code/be/utils/resolve-cli`. default-setup's `code` feature.
- **pack seeds** — `PREVIEW_PACK_SEEDS`, `IMPORT_PACK_SEEDS` (`previewPackSeeds` from `@abuddy/sdk/seed`)
- **app reset** — `RESET_APP` (`services.appData.reset()`)

plus `SECRETS_CHANGED`/`SECRETS_UPDATED` forwarding (host's `forwardSecretsChanges`) and `loadFaqs()` for
the Help tab. Three of these are host concerns already, homed here because the Settings *plugin* renders
them; one is a pack's.

### `SettingsData` is mixed ownership

```ts
export interface SettingsData { general: GeneralSettings; plugins: PluginSettings; assistant: AssistantSettings }
```

- `plugins` is `{ [pluginRef: string]: any }` — purely cross-cutting, and the host already owns its
  defaults registry.
- `general` is `{ personal, application: { hotkeys }, projects: Project[] }` — `projects` belongs to the
  code plugin, `hotkeys` is app-level, `personal` is the assistant's.
- `assistant` is `{ name, birthdate }` — default-setup's brain.

`be/types.ts` also declares `ThreadsSettings`, `LogsSettings`, `NotesSettings`, `BrowserSettings`,
`ActionsSettings`, `PromptsSettings`, `FlowsSettings`, `BrainSettings`, `DatabaseSettings` — all
default-setup's.

### The consumer map (surveyed 2026-09-22)

What actually has to move, and what it drags:

- **The store is the big one.** `repository.settingsQueries` / `settingsCommands` has **40+ call sites**
  across `code`, `threads`, `database`, `library`, `logs`, `notes`, `actions`, `prompts`, `brain`, `flows`,
  plus seeds and migrations. Every one becomes a `services.settings` call. That is the bulk of Phase 3.
- **`services.settings` has few callers**: 12, all in sandboxed seed actions (`seeds/actions/**`), plus
  tests. `getAll()` and `getGeneralSettings()` have **zero in-repo callers** — they exist for dependent
  packs.
- **`whileReplacingData` is used outside the feature**: `features/database/be/system.ts:131,223` brackets
  `services.appData.importBackup` with it. It must be on the host service's contract.
- **`document.ts` is shared BE *and* FE** — the store and system use it, and so does
  `fe/canvas/components/GeneralSettings/SettingsJsonEditor.vue:42`. Since the views move to the renderer
  and the renderer may import `@abuddy/host`, one host copy serves both.
- **`constants.ts` is shared and partly the pack's**: `be/system.ts:18` takes `REQUIRED_PROVIDERS`,
  `fe/.../Secrets.vue:113` takes both, `HelpTab.vue:60` takes the URLs — and
  `src/extensions/app/Welcome.vue:28` (default-setup's, staying) takes `DISCORD_URL`. It splits rather
  than moves.
- **`be/types.ts` is the pack's type barrel source**: `__generated__/types.ts:29` does
  `export type * from '../features/settings/be/types.js'`, so `ThreadsSettings`, `LogsSettings`,
  `NotesSettings`, `BrowserSettings`, `ActionsSettings`, `PromptsSettings`, `FlowsSettings`,
  `BrainSettings`, `DatabaseSettings`, `AgentSettings`, `CommandItem`, `Project`, `FAQItem` and more all
  live there and reach ~15 modules through the barrel. Confirms Decision 3: they move to the feature that
  owns each, and this file is split, not moved.
- **`fe/state.ts:10` imports `OutgoingSettingsEvents`** as a type from `be/system.ts`. Once both are the
  host's this is internal; until then it crosses the boundary.
- **`plugin-settings.ts` is whitelisted** in `packages/abuddy-cli/tests/build/import-specifiers.spec.ts:445`,
  so moving it changes that fixture.
- **The harness requires the settings system**: `packages/abuddy-testing/src/app.ts:378` refuses `runFlow`
  without it, naming `startApp({ systems: ['brain', 'settings', …] })`. The name it asks for changes.
- **`forwardSecretsChanges`** (`packages/abuddy-host/src/secrets/index.ts:54`) already targets the
  `settings` designation and needs no change — it resolves wherever the system runs.

### The system sends to default-setup's systems

`be/system.ts` sends `BIRTH_FLOW_START` and `COMMANDS_CHANGED` to `threads`, `RESTART_BRAIN` to `brain`,
and `PACK_CHANGED` to `host/bus`. A host system cannot name a pack's systems — that would make the host
depend on default-setup. All three targets are designated roles (`threads`, `brain`), so the sends become
role sends (Decision 9).

## Decisions

Final.

1. **Settings becomes the host feature `host/settings`**, following `host/packs` exactly: the system in
   `packages/abuddy-host/src/features/settings/be/`, the plugin's machine and public surface in
   `.../fe/`, the Vue in `packages/renderer/src/views/settings/`, registered through `hostFrontend` in
   `packages/renderer/src/views/settings/plugin.ts` and `features/index.ts`.

2. **The host owns the document's structure, not its content.** The stored document is
   `{ plugins: Record<FeatureRef, unknown>; [section: string]: unknown }`. The host knows `plugins` —
   keyed by ref, one slice per installed feature with settings — and treats every other section as
   opaque: it stores, merges, diffs and validates it without knowing its shape. `general` and `assistant`
   stay default-setup's, declared as **sections it registers** with their defaults.

   So `settingsProblems`' `SECTIONS` list stops being the literal `['general','plugins','assistant']` and
   becomes `plugins` plus the registered sections.

3. **A feature's own settings content stays in default-setup**: each `features/<id>/settings.ts`
   (its defaults, already collected by the host's registry) and each `features/<id>/fe/settings.vue`
   (its form, already rendered by the settings plugin in a `PluginScope`). Only the *container* moves.
   The per-plugin interfaces in `be/types.ts` move to the feature that owns each.

4. **`services.settings` becomes a host service** — `HOST_SERVICE_NAMES`, contract in
   `@abuddy/sdk/services/settings.ts`, implementation in `@abuddy/host/services/settings.ts`, test double
   in `@abuddy/sdk/testing`. Its surface gains the thing this goal exists for: a feature's **own**
   settings, read and written without naming itself.

5. **The system's non-settings jobs go where they belong**, in the same phase that moves the system:
   `TEST_CLI_PROVIDER` to default-setup's `code` system; `PREVIEW_PACK_SEEDS`/`IMPORT_PACK_SEEDS` and
   `RESET_APP` to the host `settings` system as host concerns (they already call host services);
   `SECRETS_CHANGED`/`SECRETS_UPDATED` stay with it, since `forwardSecretsChanges(registry)` already
   targets the `settings` designation.

6. **The `Settings` entity becomes the host's** — added to `HOST_ENTITY_TYPES`, removed from
   default-setup's `abuddy.json` `entities`, so no pack may declare it. Stored rows keep their entity
   type, so no data moves; what changes is who declares it. Packs reach it only through
   `services.settings`.

   **Those two halves land in one commit.** `RESERVED_ENTITIES` in `packs/registry.ts` is the SDK's entity
   types plus `HOST_ENTITY_TYPES`, and `registerPack` throws on a pack declaring one. So adding `Settings`
   to `HOST_ENTITY_TYPES` while default-setup still declares it makes the pack fail to register — the app
   would not boot. Until they land together the store names the entity itself (`SETTINGS_ENTITY` in
   `features/settings/be/store.ts`) without the host declaring it, which is why Phase 2 can precede the
   manifest change.

7. **`FeatureSettingsUpdated.settings` stops being `unknown`.** With the host owning delivery, the event
   a feature receives is typed from that feature's declared settings type. This is what removes the
   hand-supplied `<CodeSettings>` parameters.

8. **`browser` gains its own settings handling** like the other nine features, which is what its
   `currentPluginSettings('browser')` call was standing in for.

9. **The host settings system addresses packs by role, never by name.** `BIRTH_FLOW_START` and
   `COMMANDS_CHANGED` go to `{ role: 'threads' }`, `RESTART_BRAIN` to `{ role: 'brain' }`. Both roles are
   designated today. A host system naming `default-setup/threads` would invert the layering, and
   `check:specifiers` would be right to reject it.

10. **The store's callers move to `services.settings`, not to a host import.** The 40+
    `repository.settingsQueries` / `settingsCommands` call sites in default-setup's features become
    service calls; packs never import the host's store. `whileReplacingData` is part of the contract
    because `features/database/be/system.ts` brackets a backup import with it.

11. **`constants.ts` splits rather than moves.** `REQUIRED_PROVIDERS` goes with the system and the Secrets
    view; `DISCORD_URL`, `MEMORIAL_URL` and `API_KEY_URLS` are view content — the URLs the Help tab and
    Secrets view show — and go to the renderer, except `DISCORD_URL`, which `extensions/app/Welcome.vue`
    also uses and which therefore keeps a copy in default-setup rather than an import across the boundary.

## Settled while implementing (2026-09-22)

- **Open decision 1 — the Help tab's FAQs: Option A, as `help` entries.** A pack declares `help` in its
  manifest; the registry collects each pack's entries in registration order and the Settings view lists
  them all. Option B (an app-extension slot) does not work: a pack's Help component renders inside the
  *host's* settings plugin, with no scope from which to reach its own backend. Named `help` rather than
  `faqs` because `tests/build/no-pack-seed-specifics.spec.ts` is right that FAQ is default-setup's word
  for its own content — the pack maps its FAQ seed onto the app's help entries.
- **Open decision 2 — `general` keeps its shape.** Sections stay opaque to the host (Decision 2), and the
  host reads `general.application.hotkeys` only through the settings system's `APPLICATION_HOTKEYS` event,
  never by knowing the shape. No migration needed.
- **A third non-settings job appeared (Decision 5).** Besides CLI testing, the settings system decided
  when the assistant was born — it knew `REQUIRED_PROVIDERS` and sent `BIRTH_FLOW_START`. That moved to
  `threads`, and `forwardSecretsChanges` now tells every system declaring `SECRETS_CHANGED` rather than
  the one feature designated `settings`.

## Open decisions

Both were settled while implementing; see the section above. This section is kept only so the record of what
was open, and what it was weighed against, survives with the answer.

1. **Where the Help tab's FAQs live** (settle before Phase 5). `be/faqs.ts` reads default-setup's compiled
   `faqs.seed.json`, and the Help tab is part of the settings canvas. The renderer must not read a pack's
   seed.
   - **A pack contribution.** FAQs become something a pack registers (like commands or blocks), the host
     collects, and the settings view renders. Any pack can then contribute help. — *chosen, as `help`*
   - **An app-extension slot.** The Help tab becomes a slot default-setup fills through
     `fe.appExtensions`, keeping the FAQ reading entirely in the pack. — *rejected: a pack's Help component
     would render inside the host's settings plugin, with no scope from which to reach its own backend*

2. **Whether `general` keeps its shape** (settle before Phase 3). Decision 2 makes sections opaque to the
   host, but `general.application.hotkeys` is read by the host's own shell for application hotkeys.
   - **Leave it.** The host reads that one path opaquely, as it does today through the system's
     `APPLICATION_HOTKEYS` event. — *chosen; no migration needed*
   - **Promote hotkeys to a host section** of its own, leaving `general` purely default-setup's. Cleaner
     ownership, one more migration. — *rejected: the host already reads it without knowing the shape*

## Phases

### Phase 1 — `document.ts` to the host

The pure core, which nothing else has to wait for. It depends only on `@abuddy/sdk/ids` and
`@abuddy/sdk/utils/pure`.

- Move to `packages/abuddy-host/src/features/settings/be/document.ts`, unchanged except that `SECTIONS`
  becomes a parameter (Decision 2): `settingsProblems(next, { before, sections, keyProblem })`.
- default-setup imports it from `@abuddy/host` — temporarily, until Phase 3 removes the last caller.
  This is the one phase where a pack import of `@abuddy/host` exists; `check:specifiers` will reject it,
  so Phase 1 and Phase 2 land together or Phase 1 keeps the file in place and only adds the host copy's
  tests. Prefer the latter: **copy the module, add its specs, and delete the pack's copy in Phase 3.**

**Done when:** `packages/abuddy-host/tests/features/settings/document.spec.ts` covers `setIn`/`removeIn`
prototype safety, `changesFrom`, `isEqual` and `settingsProblems` with a caller-supplied section list;
`npm test -w @abuddy/host` and `npm run typecheck:host` pass. Mutation: allowing an unknown section fails
the spec.

### Phase 2 — The store and the entity

- `packages/abuddy-host/src/features/settings/be/store.ts` from `be/repository/index.ts` (170 lines), with
  `import { tx, untypedQx } from '@abuddy/ears'` in place of the pack's generated EARS, and the sections
  of Decision 2.
- `Settings` into `HOST_ENTITY_TYPES` (`app-state/index.ts` or a sibling), out of default-setup's
  `abuddy.json` (Decision 6).
- The defaults: per-feature from `getPackSettingsDefaults()` (already host's); sections from whoever
  registered them.

**Done when:** specs cover stored-vs-effective merging, the one `write()` refusing a bad document,
listeners firing in order, and `whileReplacingData` bracketing; `npm test -w @abuddy/host`,
`npm run typecheck:host`. Mutation: writing without the check fails the refusal spec.

### Phase 3 — `services.settings` as a host service

> **Done, 2026-09-22.** `services.settings` is a host service end to end — contract, implementation,
> `HOST_SERVICE_NAMES`, `HostRuntimeServices`, `createHostRuntime`, the `@abuddy/host/settings` export and
> the harness binding the real store — and default-setup's own `settings` service is gone.
>
> **No pack code reads or writes the settings row any more**: `git grep 'repository.settings'` in
> `packages/default-setup/src` finds nothing. All ~60 call sites across the ten features, the three
> migrations, the seed actions and the settings seeder go through `services.settings`.
>
> The sections mechanism of Decision 2 landed with it, because the section-dependent half of the surface
> (`getSettings`, `getGeneralSettings`, `updateSettings`, `replaceSettings`, …) could not move without it:
> `PackRegistration.settingsSections` (a lazy provider, so a pack may read its compiled seeds on first
> use), the manifest field, the codegen that emits it, and `createSettingsDefaultsStore` merging each
> pack's sections into the default document. default-setup registers `general` and `assistant` through
> `features/settings/sections.ts`. `PackSettingsDefaults.settings` is now the whole default document
> rather than `{ plugins }` alone.
>
> Two stores still write the row: this pack's repository remains for the settings system's own use, and
> the system listens to **both** (`settingsWriteListener`), so a feature is told its settings changed
> whichever wrote them. Phase 4 deletes this pack's store with the system.
>
> **The migration found untyped code.** `getPluginSettings` returned `any`; `forFeature` returns
> `unknown`, so ~25 reads now name their type (`ThreadsSettings`, `CodeSettings`, `GeneralSettings`, …).
> `getAll` and `getStored` are generic for the same reason. Nobody could see those reads were untyped.

- Contract in `@abuddy/sdk/services/settings.ts`, implementation in
  `packages/abuddy-host/src/services/settings.ts`, `HOST_SERVICE_NAMES`, `createHostRuntime`'s services,
  `HOST_SERVICE_KEYS` in `tests/boundaries.spec.ts`, and the in-memory double in `@abuddy/sdk/testing`.
- Add the own-settings surface (Decision 4) and delete default-setup's `be/services/settings.ts`,
  `be/repository/`, `be/defaults.ts` and `document.ts`.
- Migrate every `services.settings` caller.

**Done when:** `tests/boundaries.spec.ts` passes with the new key; `npm run api:update` in
`packages/abuddy-sdk` with `etc/` committed; `npm test -w @abuddy/host`, `npm test -w @app/default-setup`,
`npm run typecheck`.

### Phase 4 — The system

- `packages/abuddy-host/src/features/settings/be/system.ts`, registered in `features/registration.ts`
  and `features/index.ts`, running at `host/settings` with the `settings` designation.
- Split out the non-settings jobs (Decision 5).
- `forwardSecretsChanges(registry)` keeps targeting the `settings` designation — confirm with a spec.

**Done when:** `npm test -w @abuddy/host`, `packages/api/tests/unit/` pass; a spec pins that
`getDesignated('settings')` resolves to `host/settings`.

### Phase 5 — The plugin and its views

- Machine and `fe/public.ts` to `packages/abuddy-host/src/features/settings/fe/`; the Vue to
  `packages/renderer/src/views/settings/`; `hostFrontend` gains `settings`.
- Per-feature `settings.vue` forms stay in default-setup and keep rendering through `PluginScope`
  (Decision 3) — now a host plugin rendering a pack's component, which is the same mechanism the Plugins
  tab already uses.
- Settle Open decision 1 (FAQs) before this phase.

**Done when:** `npm run typecheck:fe`, `npm test -w @app/renderer`, `npm test` (E2E) pass; `npm start`
opens Settings with the General, Plugins and Help tabs working, and every feature's settings form renders.

### Phase 6 — Delete the feature, and fix what it was standing in for

- `packages/default-setup/src/features/settings/` is deleted; `settings` leaves default-setup's
  `abuddy.json`.
- `browser` handles `FEATURE_SETTINGS_UPDATED` (Decision 8); `code`'s two components read their own
  machine; `usePluginSettings`/`currentPluginSettings` are gone.
- `FeatureSettingsUpdated` is typed per feature (Decision 7), and the hand-supplied type parameters go.
- A migration if any stored path moved (Open decision 2).

**Done when:** the full chain passes; `git grep 'features/settings'` finds nothing in
`packages/default-setup`; a feature's own settings are reachable with no default-setup import.

## Constraints

- Commit each phase as it finishes, no attribution lines, `git commit -- <paths>`; `git diff --cached`
  first. Pushing, tagging and PRs are on request.
- No publishing, releases or triggered workflows. No real data dirs, no broad pkill.
- No bare `tsc` in `packages/preload`; no `npm install` in the example pack; no version metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any` in the pack-facing SDK, the TypeScript 5.7 floor, `api:update` after export
  changes with `etc/` committed.
- Migrations follow `packages/abuddy-host/src/migrations/CLAUDE.md`: the latest unreleased target, never a
  new version file unless the latest has shipped.
- Build order: `packages:build` before the CLI suite; `npm run compile` before the api suites and E2E.
  Suites don't run concurrently.
- External packs are first-class: a pack's settings must keep working through `services.settings` and its
  `settings.ts` defaults, and `test:external-pack` and `test:packaged-authoring` keep passing.
- This goal and [`goal-plugin-inbox.md`](goal-plugin-inbox.md) both touch what a feature may reach. They
  are independent, but whichever lands second re-checks the other's call sites.

## Outcome (2026-09-22)

Done, in eight commits on `AS/shell-owned-plugins`, ending with the atomic move
`refactor(settings): the settings are the app's, and the view that draws them is the app's too`.

| Phase | Result |
|---|---|
| 1 — `document.ts` to the host | `packages/abuddy-host/src/features/settings/be/document.ts`, with sections a `SettingsCheck` parameter rather than a fixed list |
| 2 — the store and the entity | `be/store.ts`: `createSettingsStore({ defaults })`, one `write()`, `whileReplacingData`. `Settings` joins `AppState` in `HOST_ENTITY_TYPES` |
| 3 — `services.settings` as a host service | `@abuddy/sdk/services/settings.ts` + `@abuddy/host/services/settings.ts`, in `HOST_SERVICE_NAMES`; `PackRegistration.settingsSections` and the manifest field for a pack's own sections |
| 4 — the system | `features/settings/be/system.ts` at `host/settings`. Its three non-settings jobs left first: CLI testing to `code`, the assistant's birth flow to `threads`, and the FAQ tab to the `help` contribution any pack can make |
| 5 — the plugin and its views | `features/settings/fe/machine.ts` in the host, `packages/renderer/src/views/settings/` in the renderer, registered through `hostFrontend`. Frontend code reaches the settings through the SDK's `SettingsPort`, never the view's actor |
| 6 — delete the feature | `packages/default-setup/src/features/settings/` is gone; its 28 per-feature settings types went to the features that own them, and its `general`/`assistant` sections to `src/app-settings/` |

Checks, all green at the final commit: `typecheck`, `schema:check`, `api:check`, `facade:check`,
`packages:build` + `packages:check`, `test:unit` (2914 tests across eight workspaces), `compile`, `build`,
`npm test` (20 E2E), `test:external-pack`, `test:packaged-authoring`.

Conventional choices made where the plan didn't say:

- **`useSettingsSection`/`useFeatureSettings`/`useSettingsSave` throw outside an effect scope**, as
  `useShell` does — they follow the settings until the scope is disposed. Three call sites that had called
  the old composable *inside* a `computed` getter were hoisted to setup; the E2E navigation spec is what
  caught them.
- **The Settings row is written on the first change**, not created by a boot hook. default-setup's
  `onInit` no longer creates it: the row holds only what the user changed, so an app at its defaults has
  nothing to store. `packages/api/tests/unit/app-reset.spec.ts` reads it through `services.settings`
  rather than the raw row.
- **The fixture packs' "reach a dependency's system" specs point at `default-setup/library`**, since
  `settings` is no longer a dependency's system to reach.
