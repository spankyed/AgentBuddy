# Move `logs` into the host pack

**Status:** deferred — researched, not scheduled
**Prompted by:** 2026-10-07, [`goal-one-kind-of-pack`](../../archive/goals/goal-one-kind-of-pack.md)'s Phase 4

## Why it is deferred, and why the research is kept

Phase 4 originally moved `logs` to the host pack so `earlySystem` could leave the pack contract. The field
is being deleted on its own instead, which removes more and moves nothing — so the move is no longer
*needed* for the goal.

What it would still buy is the thing the move was always really about: **the Logs plugin becoming a core app
feature**, shipped and updated only by a full app release rather than as pack content. That is a product
question, not a refactor one, and it is open.

This file is the research, so that whenever the question is answered the work is costed rather than
rediscovered. **The headline finding is that the move is far cheaper than its size suggests:** not one file
in the feature imports anything outside it — no EARS, no repository, no other default-setup feature, no
content, no step. The whole coupling to the pack is four generated facades and some `'logs'` string literals.

**What changed under this plan when `earlySystem` went.** The move no longer deletes anything from the pack
contract; that is done. Instead it has to *restore* early start, host-side — see below.

## Where each file goes

Host features are `be/` + `fe/` in `@abuddy/host` with their Vue in the renderer — the shape `host/settings`
has, whose machine is `features/settings/fe/machine.ts` and whose components live in
`renderer/src/views/settings/`.

| from `default-setup/src/features/logs/` | to |
|---|---|
| `be/{contract,types,utils,system}.ts` | `abuddy-host/src/features/logs/be/` |
| `fe/state.ts` | `abuddy-host/src/features/logs/fe/machine.ts` — the name all three host features use |
| `fe/{contract,search}.ts` | `abuddy-host/src/features/logs/fe/` |
| `settings.ts` | `abuddy-host/src/features/logs/settings.ts`, **verbatim** |
| `fe/plugin.ts`, `fe/canvas.vue`, `fe/settings.vue` | `renderer/src/views/logs/` |

The defaults file moves unchanged: it is already a plain `FeatureSettings`
(`{ visible: false, plugins: { logs: … } }`), `PackRegistration.features[].settings` already exists, and
`registry.ts:383` registers defaults for **every** registration including the host's.
`checkFeatureSettings` keys on the feature id, which stays `logs`; only the ref becomes `host/logs`.

## The imports to rewrite — the whole porting surface

| in the feature | becomes |
|---|---|
| `services` from `#generated/services.ts` | `@abuddy/sdk/services`, as `features/settings/be/system.ts` does |
| `broadcastToPlugin` / `sendToSystem` from `#generated/events.ts` | `abuddy-host/src/events.ts`, both halves |
| `ref('logs')` from `#generated/ref.ts` | `HOST.logs` |
| `LogsSettings` from `#generated/types.ts` | a relative import — that generated file is only `export type * from '../features/logs/be/types.ts'` |
| `OutgoingLogsEvents` from `#features/logs/be/types.ts` | `../be/types.ts` |

`fe/canvas.vue` also uses `resolveName('settings', 'host')`, which becomes `HOST.settings`.

## The five wirings

1. **`src/refs.ts`** — `logs: resolveName('logs', HOST_PACK_ID)` on `HOST`.
2. **`src/features/registration.ts`** — widen `systems` with `logs?: PackFeatureSystem`, and add the feature
   with its `settings` and `plugin: { receives: [...LOGS_PLUGIN_EVENT_TYPES,
   ...HOST_PLUGIN_EVENT_TYPES['host/logs']] }` — the two-source shape `settings` already uses.
3. **`src/events.ts`** — `host/logs` into `HostPlugins` (the system broadcasts to it) and `HostSystems` (the
   frontend sends `CLEAR_LOGS` / `REQUEST_LOGS_UPDATE`). Its own comment says these maps are
   `registration.ts`'s `receives` expressions as types, and to keep them together.
4. **`@abuddy/sdk`'s `events/index.ts`** — `'host/logs'` into `HostPluginEvents` and
   `HOST_PLUGIN_EVENT_TYPES`. **Load-bearing, not bookkeeping:** that record is the only source of host
   names in pack codegen (`generate-entries.ts:830`), so without it no pack can name `host/logs` and the
   fixture's send cannot compile.
5. **The call sites that pass the system** — `api/src/runtime/index.ts:134`, the harness if logs should run
   there, `renderer/src/views/packs/plugin.ts`'s `hostFrontend.features`, and the `src/features/index.ts`
   and `src/fe/index.ts` re-exports.

## Early start, which has to come back

Phase 4 deleted the pack-facing route to running before hydration, and that is correct and permanent. If
`logs` moves, the host wants it again — to put hydration, `onInit`, migrations and applying back in the
viewer, which is the window that deletion gave up.

**Restoring it host-side is cheaper than what was deleted, but it is not free: the host mechanism went
too.** Phase 4 deleted `startEarlySystems`, `EarlySystems`, `createAppBus`'s second parameter, the
registry's `getEarlySystems` and its two `!system.early` filters, `PackFeatureSystem.early` and
`packSystem`'s option — about forty lines of source and a 122-line spec — because after the field went
nothing set `early`, and a mechanism with no caller is one nobody is testing against reality. That is the
same test Decision 5 applied to `partitionPolicy`.

So this plan has to bring them back, which is a `git revert` of that part of Phase 4's commit rather than a
design: `hostRegistration` writes its `PackFeatureSystem` literally, so the *declaration* stays one
property, and what is restored is the plumbing under it. Either way the capability never returns to the
pack contract — that half is permanent.

## The migration

The ref `default-setup/logs` → `host/logs` is a key in **four** places of stored data, not the three the
goal's phase said:

- the settings row's `plugins` slice;
- `AppState.pluginVisibility`;
- `AppState.lastActivePlugin`;
- **stored message link blocks**, which carry a plugin ref as `event.target`.

The first three go in the unreleased `0.3.15` app migration
(`abuddy-host/src/migrations/app/0.3.15.ts`), which already moves plugin settings onto refs and has
`addressPluginKeys` and the `RENAMED_STATE_RECORDS` idiom to copy. A `RENAMED_PLUGIN_REFS` constant and a
`renamePluginRefs()` step **after `moveShellState` and `movePluginSettings`** — those two produce
`default-setup/logs` from pre-0.3.15 data, so the rename runs on their output. Idempotent by the file's own
rule: remove the old key as you handle it, write only on a real change.

The fourth is default-setup's, not the host's: move `logs` out of `FEATURES_0314`
(`bare-feature-ids.ts:13`) into `MOVED_SINCE_0314` beside `settings: 'host/settings'`, which is the
precedent for exactly this and is what makes `addressStoredLinkBlocks` repoint a link written as the bare id.

**One step changes owner.** `default-setup/src/migrations/0.3.15.ts:48-52` writes the logs settings slice
through `ref('logs')` — the `log-service` → `action:*` carry-over. After the move default-setup cannot name
the feature, so that step moves into the host's `0.3.15.ts`, where the data now lives.

## The sharpest edge: the fixture's typed send

`tests/packs/external-pack` sends `LOG_ADDED` to `default-setup/logs`
(`src/features/memos/be/system.ts:24`), typed through the **dependency snapshot** and the plugin contract's
`public` inbox — the only place in the repo exercising that split from outside the declaring pack.

Afterwards the target types through `HOST_PLUGIN_EVENT_TYPES`, which is why wiring 4 is required. The
fixture keeps `"dependencies": { "default-setup": "*" }`: it also sends to
`default-setup/{library,notes,code}` and content with `default-setup:library`.

`typed-sends.spec.ts:26-27`'s `@ts-expect-error` for `ADD_LOG` **still holds for a different reason** — a
pack sending a system's internal event would be refused by `HostSystemEvents` rather than by a pack
contract's internal/public split. The case wants a comment saying so, because the mechanism it proves has
changed.

## Specs

**Four move** to `abuddy-host/tests/features/logs/{be,fe}/`. `be/excluded-sources.spec.ts` and
`fe/search.spec.ts` are pure and move with import paths only. `be/system.spec.ts` re-points its ref
literals and aims its registration assertion at `hostRegistration()`. `fe/link-navigation.spec.ts` belongs
on the host side anyway — its own comment names `features/settings/fe/plugin-select.spec.ts` as the
counterpart.

**The ref literal changes** in `abuddy-host/tests/bus/outgoing-events.spec.ts:261-265`,
`features/application/fe/open-plugin.spec.ts` (4 sites), `features/application/system.spec.ts:40,49`,
`features/settings/fe/plugin-select.spec.ts:28,32`,
`api/tests/runtime/upgrade-from-0.3.14.spec.ts:93`,
`tests/e2e/app-integration/feature-addressing.spec.ts:56-66`, `tests/e2e/ui/fallback-panel.spec.ts:6`, and
the three fixture specs.

**Two default-setup specs are repointed**: `tests/registries.spec.ts:7-10` (the logs entry is no longer the
pack's) and `tests/harness-shell-lookups.spec.ts:7,10` (swap for another plugin's state).
`tests/migrations/0.3.15.spec.ts` keeps writing `default-setup/logs`, which is right — it tests migration
behaviour over historical data — but the rename's end state wants asserting, there or on the host side.

## Docs

`docs/public-facing/{features.md:140, architecture.md:81}`,
`packages/default-setup/CLAUDE.md:60,75,239`,
`packages/abuddy-host/CLAUDE.md:79`, `packages/api/CLAUDE.md:76`,
`packages/abuddy-testing/CLAUDE.md:178`, `tests/e2e/CLAUDE.md:127`.

## Recorded, not changed

`@abuddy/host/logs` is already an export subpath, for `src/logs.ts` — the capped log-**file** appender the
api, main and renderer loggers use. A different concern from the viewer, and the feature needs no subpath
of its own, so both stay. The collision is only in grepping, and this paragraph is the warning.

## Verification

```
npm run generate:entries -w @app/default-setup    # the pack's __generated__ loses logs
npm run api:update
npx tsc --noEmit -p packages/abuddy-host/tsconfig.json   # then sdk, renderer, pack, cli
npm run spec -- logs && npm run spec -- typed-sends
npm run chain
```

**The typecheck is the main instrument.** The pack's generated `FeatureName` union drops `'logs'`, so every
remaining `ref('logs')` or bare-`'logs'` send inside default-setup becomes a compile error, and the
fixture's send fails until wiring 4 lands.

**Then the app, because this is a plugin.** `npm start`: the Logs tab appears, shows lines, its settings
panel writes (max logs, excluded sources), and the toolbar link still opens Settings on the Logs plugin.

**The migration, against real data.** Boot an app whose data dir predates the change and confirm the logs
slice, the tab's visibility and `lastActivePlugin` survive under the new ref; boot again and confirm
nothing moves the second time. Mutation: skip the rename step and that case fails.

## Risks

**A half-done move breaks every logs settings write.** The settings document checks a ref against
"installed features with settings" (`SETTINGS_KIND`, `document.ts:60`), resolved from the registry, so
`host/logs` is only valid once wiring 2 lands.

**If early start is restored, nothing would notice its absence.** A host logs system registered without
`early: true` works in every respect except that the viewer starts at hydration, and no test covers that.
Whatever pins it — a case on the registration, as the pack's spec had — has to be written deliberately.
