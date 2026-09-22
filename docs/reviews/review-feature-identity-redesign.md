# Review: the feature identity redesign

Reviewed at `aa93b165d` and re-checked at `5e770758c` (branch `AS/designations-and-addressing`). It covers the
redesign in `docs/plans/feature-identity-redesign.md`, commits `49a978f55`…`5e770758c`. B5–B6 and C5–C11 come from a
second pass and were checked at `84f08835e`.

The core model is sound:

- one spelling for a feature, `<packId>/<featureId>`;
- messages as an envelope, `{ to, event }`;
- one feature-keyed registration;
- the app shell's state owned by the host, not by default-setup's settings.

The older migrations no longer lose defaults (`review-feature-addressing-followup.md` R3). `0.3.0` now reads only
stored data, and `0.3.13` is gone, because each feature's own default visibility now covers what it backfilled.

Every item below was a defect or a concrete simplification, and none had a test.

## Status

Every finding is fixed. Each fix that changes behaviour has a test, mutation-checked: breaking the fix fails it.

| Item | Fix | Test |
|---|---|---|
| B1 | The application actor keeps a plugin it can't open yet (`pendingPluginId`: the last-open one, or a popout's) and opens it when its pack's plugins arrive, unless the user opened another first | `renderer/…/application-shell-state.spec.ts` |
| B2 | Both registries check a registration's keys with one host helper, `checkFeatureIds` (`packs/feature-ids.ts`) | `abuddy-host/tests/fe/fe-registration-failure.spec.ts` |
| B3 | The plugin undo guards `indexOf` like the tiptap undo | — (latent; no path reaches it) |
| B4 | `@abuddy/sdk/ids` holds the id grammar (`PACK_ID_PATTERN`, `FEATURE_ID_PATTERN`); `splitRef` checks both segments and `resolveName` throws for anything that makes no ref | `abuddy-sdk/tests/ids/resolve-name.spec.ts` |
| B5 | 0.3.15 keeps an unowned shell-state id under its bare id; the host `application` system moves it onto the ref on `PACK_CHANGED` (`addressShellState`) | `abuddy-host/tests/migrations/plugin-settings-0.3.15.spec.ts`, `tests/bus/application-system.spec.ts` |
| B6 | A plugin offers its panel for plugins without one through `Plugin.fallbackPanel` (`label`, `isShown(snapshot)`, `toggle`); the shell uses whichever plugin declares it and never reads the brain's context. The settings lookup is guarded too | `tests/e2e/fallback-panel.spec.ts` |
| C1 | Dead `bus` imports removed (eight default-setup systems, the fixture, `application-system.ts`, and `sendVisibility`'s parameter) | — |
| C2 | `bus` lives in `@abuddy/host/bus` | — |
| C3 | Stale `emit` and `system.get(bus)` comments corrected | — |
| C4 | Each plugin's `receives` is written inline in the pack entry; `receivedEventTypes` is gone | `abuddy-sdk/tests/build/generate-entries.spec.ts` |
| C5, C10 | `#generated/ref` exports `ref(name)`, bound to the pack; `bus-ids`, `busId` and pack code's own pack id are gone | `generate-entries.spec.ts` |
| C6 | `defineSystem<…>()` takes no id; `SystemOfFeature`, `packSystem`'s check and the id exports are gone. Codegen reads every system's events, so an entry annotated `: SystemEntry` fails naming the fix | `generate-entries.spec.ts`, `abuddy-cli/tests/build/facade-gate-system-entry.spec.ts` |
| C7 | `startEarlySystems(registry)` (`@abuddy/host/bus`) delivers an early system its messages and each connection; the app bus skips early systems' refs; logs handles its events like any system | `abuddy-host/tests/bus/early-systems.spec.ts` |
| C8 | The `<packId>.<featureId>` shim and its test are gone | — |
| C9 | Main checks a popout's plugin id with `splitRef`; `isPluginId` is gone | `resolve-name.spec.ts` |
| C11 | `ApplicationEvent` lists no `CLIENT_CONNECTED`; the visibility comments name AppState | — |

## Bugs

### B1. An external pack's plugin is never reopened as the last-active plugin

`applyShellState` (`packages/renderer/src/core/actors/application.ts:619`) runs when the client connects. It
selects `lastActivePlugin` only if that plugin is already in `context.plugins`. But an external pack's frontend
loads *after* the client connects, and `mergePackPlugins`, which handles `PACK_FRONTEND_LOADED`, never tries again.

So a user whose last-open plugin was `memo-pack/memos` reopens on the default plugin every time.

`application-shell-state.spec.ts:57` ("stays where it is when the plugin last open is not one it has") only checks
the moment of connecting, so it passes while the restore never happens.

At `f0ce462f1`, the renderer kept a last-active id it couldn't place yet, so the plugin could still be restored
once its pack loaded. The redesign dropped that.

**Fix:** keep the id pending in the application context, and select it when its pack's plugins arrive, unless the
user has navigated since.
**Test:** connect with `lastActivePlugin: 'memo-pack/memos'`, then send `PACK_FRONTEND_LOADED` with that plugin, and
expect it to be selected.

The popout window has the same gap. It opens on the plugin id in its URL (`initialPluginId`), which
`application.ts:917` looks up among the plugins passed in at construction: the built-in ones only. Popping out an
external pack's plugin opens a window on `plugins[0]` (Threads). The same pending id, applied on
`PACK_FRONTEND_LOADED`, fixes both.

### B2. The frontend registry doesn't check feature ids, and the backend registry does

`registerPack` refuses a feature id containing `/` (`pack-registration.ts`, in `registerPack`). `registerPackFE`
(`packages/abuddy-host/src/fe/pack-store.ts:68`) doesn't check at all. It resolves each key of `plugins` with
`resolveName(featureId, packId)`:

- a key `other-pack/notes` registers a plugin at *another pack's* ref;
- keys `x` and `my-pack/x` both resolve to `my-pack/x`, so two plugins with one id land in `allPlugins`.

**Fix:** move the backend's check into one host helper that validates a registration's feature ids, and call it
from both registries.
**Test:** `registerPackFE` with a `plugins` key containing `/` is refused and registers nothing.

### B3. A registration undo can remove another pack's plugin (latent)

`registerPackFE`'s undo is `allPlugins.splice(allPlugins.indexOf(plugin), 1)` (`pack-store.ts:72`), with no
`>= 0` guard. If the plugin is already gone, `indexOf` returns `-1`, and `splice(-1, 1)` removes the *last*
plugin, which belongs to another pack. The tiptap undo a few lines below keeps the guard.

### B4. `resolveName` doesn't validate a bare name

`resolveName` (`packages/abuddy-sdk/src/ids/addressing.ts`) checks a name containing `/` with `splitRef`, but
builds `` `${packId}/${name}` `` from a bare name without checking it:

- `resolveName('', 'p')` gives `p/`, which `splitRef` itself rejects;
- `resolveName('a.b', 'p')` gives `p/a.b`.

**Fix:** run the resolved ref through `splitRef` and throw when it isn't one.

### B5. The 0.3.15 shell-state move drops a disabled pack's tab visibility and last-active plugin

`moveShellState` (`packages/abuddy-host/src/migrations/app/0.3.15.ts`) addresses `_meta.visibility`, keeps only
entries whose ref is a registered plugin, and then deletes `_meta` from the settings. A disabled pack isn't
registered when migrations run, so its bare keys have no owner and are filtered out:

- the user hid a disabled pack's tab: the tab shows again once the pack is re-enabled;
- the last-open plugin was a disabled pack's: it is dropped.

That pack's plugin *settings* are handled the other way. They stay unmoved and are re-addressed when the pack
registers (`settingsCommands.addressStoredPluginKeys` on `PACK_CHANGED`). Nothing does the same for the shell state
in AppState.

**Fix:** keep entries with no owner in AppState, and re-address them when a pack registers, as the settings system
does. Or leave them in `_meta` until a registered plugin owns them.
**Test:** migrate 0.3.14 settings with `_meta.visibility.memos: false` while the pack owning `memos` isn't
registered; register it; expect `memo-pack/memos` hidden.

### B6. The host shell requires a pack playing `brain` (latent)

`packages/renderer/src/WebApp.vue:125` runs `applicationState.system.get(getDesignated('brain'))` at setup with no
`hasDesignation` guard, and `getDesignated` throws when no pack plays the role. It then reads that plugin's
`inspectEnabled` from its machine context: the last cross-plugin context read that T8 of the plan removes (`openLink`
already replaced the other, `openInAppBrowser`). It can't fire while default-setup is always installed, but it ties
the shell to one pack's machine.

**Fix:** guard it like `fallbackPanel` does two lines below, and have the brain plugin expose inspect mode rather than
the shell reading its context.

## Cleanup and simplification

### C1. Dead imports

- `bus` is imported and never used in default-setup's `actions`, `brain`, `database` and `flows` systems
  (`features/<feature>/be/system.ts`).
- `packages/abuddy-host/src/bus/application-system.ts` imports `bus` and never uses it, and `sendVisibility` takes
  a `{ system }` parameter it doesn't read.

### C2. `bus` no longer belongs in the pack-facing `@abuddy/sdk/ids`

Pack systems no longer reach the bus. Only host code uses the constant: the bus machine, the `packs` system, the
API's composition and the test harness. Moving it to `@abuddy/host` takes it off the pack surface.

### C3. Stale comments still describe `emit` and `system.get(bus)`

- `packages/abuddy-sdk/src/events/index.ts:12` names `emit` among the sends to plugins;
- `events/index.ts:127` describes `sendToPlugin` as working "as `emit` in a system";
- `packages/abuddy-host/src/bus/machine.ts:110` says systems reach the bus with `system.get(bus)`;
- the `bus` constant's own doc comment in `@abuddy/sdk/ids` says the same.

### C4. `receivedEventTypes` exists only to feed codegen's own output

Codegen exports `receivedEventTypes` from `#generated/events`, and then the generated pack entry imports it to
fill each plugin's `receives` field (`generate-entries.ts:625` and the import after it). Writing `receives` inline
into each feature's entry removes the export, the import and the lookup.

### C5. `busId` is generated and never read

`generateBusIds` (`packages/abuddy-sdk/src/build/generate-entries.ts:847`) still writes `busId` into
`#generated/bus-ids`, and nothing imports it: pack code names features, and generated code resolves names itself.
The file is imported only for `packId` (`settings/plugin-settings.ts`, `logs/be/system.ts`). Generate `packId`
alone, in a file named for it.

### C6. `defineSystem`'s id is redundant

A system's feature id comes from the manifest, and codegen already passes it to `packSystem(entry, featureId)`.
`defineSystem(feature)` makes the module repeat it, and two guards then check the copy:

- at compile time, `SystemOfFeature` (`packages/abuddy-sdk/src/events/index.ts:76`);
- at runtime, `packSystem`'s throw (`packages/abuddy-sdk/src/framework/system-utils.ts:17`).

The per-feature `export const <feature> = <feature>Spec.id` in each of default-setup's 12 system modules is imported by
nothing (only `logs` reads its own, inside its module). The fixture has one too, and the CLI scaffold writes one
(`packages/abuddy-cli/src/commands/add/feature.ts:29`).

**Proposal:** `defineSystem<...>()` takes no id; codegen supplies it. That deletes `SystemOfFeature`, the runtime check,
13 exports and the scaffold line. It changes public API, so it needs `api:update`. The host's `packs` system
(`packs-system.ts:44`, `resolveName(packsSpec.id, HOST_PACK_ID)`) would name its feature directly.

### C7. The early (logs) system's routing is two rules that must agree

- The bus skips a message addressed to `getDesignated('logs')` (`packages/abuddy-host/src/bus/app-bus.ts:32`). That
  keys on a role name, not on the system being early.
- The logs system subscribes to every incoming message with `onIncoming` and filters by its own address
  (`default-setup/src/features/logs/be/system.ts:46`). That is the only reason it imports `packId`.

The host starts the early system and knows its ref (`PackFeatureSystem.early`). **Proposal:** the host delivers
messages for early systems to the actor it started, and logs handles its events like any system. The role special
case, the self-filter and logs' `packId` import all go.

### C8. A shim for development data that no release has

`ownersOf` (`packages/abuddy-sdk/src/framework/pack-settings.ts:87`) maps `<packId>.<featureId>` keys onto refs. Only
intermediate commits on this branch ever stored that spelling, and no release did (the plan: "the `.` spelling exists
in no user's stored data yet"). Delete it and its test, and reset any local development data that holds such keys.

### C9. The main process re-implements the ref format

`isPluginId` (`packages/main/src/modules/window-manager/plugin-id.ts`) has its own regex, and still accepts a bare id,
which no plugin has any more. Use `splitRef` from `@abuddy/sdk/ids`; `@app/main` already depends on the SDK.

### C10. Pack code passes its own pack id by hand

`settings/plugin-settings.ts` (twice) and `logs/be/system.ts:46` call `resolveName(name, packId)` with `packId` from
`#generated/bus-ids`. Codegen could export a pack-bound `ref(name)`, as it binds `navigateToPlugin`, so pack code
never supplies its own pack id. After C7, only the settings sites remain.

### C11. Leftovers

- `ApplicationEvent` (`packages/abuddy-host/src/bus/application-system.ts:21`) lists `CLIENT_CONNECTED`, which that
  machine doesn't handle: the bus sends the shell state through `connectedEvents` instead.
- `packages/renderer/src/core/actors/application.ts:480` says tab visibility "comes from settings". It comes from
  AppState, through the host `application` system.

## Suggested order

1. B1 (with the popout case), B2 and B5, each with a test that fails before its fix.
2. B3, B4, B6, C1–C3, C9 and C11, as one small change.
3. C4, C5 and C8.
4. C7, then C10.
5. C6, if the public API change is wanted.
