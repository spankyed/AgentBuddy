# Review: making the feature identity code smaller and simpler

Reviewed at `73261e972` (branch `AS/designations-and-addressing`). This review is about succinctness and
maintainability, not correctness: `npm run typecheck` passes, and the open bugs are in
`review-feature-identity-redesign.md`. It covers the identity and messaging code:

- `@abuddy/sdk`: `ids`, `events`, `framework`, `fe`, the emitter in `services`, and the event half of `generate-entries.ts`;
- `@abuddy/host`: the bus, the pack registry, the frontend store and the 0.3.15 migration;
- the test harness's resolvers;
- the renderer's application actor;
- default-setup's settings.

The redesign got the model right: one spelling, an envelope, one feature-keyed registration. What's left is mostly
the same idea implemented more than once. It comes in three kinds.

- **The host is a pack on paper only** (S1, S2). It is spelled `host/<feature>` but registered through side
  channels, so every registry consumer special-cases it.
- **The frontend and backend describe one feature two ways** (S3, S4).
- **Small copies**: of the send types, the name resolvers, the event-type pins and the settings key helpers (S5–S9).

Each item below says what exists, what would replace it, and what that removes.

## Status

Every item is done. Behaviour changes have tests; the pure moves are covered by the suites that exercise them.

| Item | Done as | Test |
|---|---|---|
| S1 | The host registers through `registerPack` (`hostRegistration`, `abuddy-host/src/packs/host-pack.ts`: its plugins always, its systems where the caller runs them) and its frontend through `registerPackFE`; `registerHostSystem`, `registerHostPlugin` and their maps are gone. The Packs tab sorts last by rule (`withHostLast`) | `abuddy-host/tests/packs/event-validation-map.spec.ts`, `renderer/…/application-shell-state.spec.ts` |
| S2 | `HOST` (`abuddy-host/src/host-refs.ts`: `bus`, `application`, `packs`), which host code and the renderer import | — |
| S3 | `PackFERegistration.features: { [id]: { plugin, designation?, default? } }`, written from the same loop as the backend entry | `abuddy-sdk/tests/build/generate-entries.spec.ts` |
| S4 | One contributions table on both registries (`Contribution`, `definitions`, `addContributions` in `extensions.ts`); a role another pack plays refuses the frontend too | `abuddy-host/tests/fe/pack-store-designations.spec.ts` |
| S5 | `Qualified<PackId, M>` and `WithOwnNames<PackId, M>` in `@abuddy/sdk/events`; codegen emits the two qualified maps and derives the other two | `abuddy-sdk/tests/events/qualified-maps.spec.ts` |
| S6 | `resolveRegistered` in `@abuddy/sdk/ids`, used by `services.emitter` and the harness | `abuddy-sdk/tests/ids/resolve-name.spec.ts` |
| S7 | `eventTypes<E>()(...)` in `@abuddy/sdk/events` pins all four lists | `abuddy-sdk/tests/events/event-types.spec.ts` |
| S8 | The typed sends take `SystemEvents` and `FeatureSettingsUpdated` for any `FeatureRef`; the settings system's casts are gone | `abuddy-sdk/tests/events/typed-sends.spec.ts` |
| S9 | `pluginSettingsKey` and `PluginSettingsKey` are gone (`ref(name)`, `FeatureRef`); the repository is the one runtime check (actions call it with strings, typed `` `${string}/${string}` ``); `broadcastSettings` serves every change, so a reset now also refreshes the shell's hotkeys | `default-setup/tests/unit/settings-broadcast.spec.ts` |
| S10 | `visiblePluginsOf(context)`; the field is gone | `renderer/…/application-shell-state.spec.ts` |
| S11 | `abuddy-host/src/packs/plugin-keys.ts` owns the move (`addressStoredPluginKeys`: the shell state and the settings row), run by the host's 0.3.15 migration and on `PACK_CHANGED`; the SDK exports, default-setup's move and the settings system's hooks are gone. A pasted pre-0.3.15 export asks the host through `host/bus`'s `PACK_CHANGED` | `abuddy-host/tests/packs/plugin-keys.spec.ts`, `tests/bus/application-system.spec.ts`, `default-setup/tests/unit/plugin-settings-keys.spec.ts` |
| S12 | `openRef`, shell event fields `plugin`, "ref" in comments and errors (postal addresses and the address bar keep theirs) | — |
| S13 | `#generated/fe` imports `ref` | — |

## S1. Register the host as a pack

**What exists.** The host's own features (`application`, `packs`) reach the registries by other routes:

- Backend (`packages/api/src/setup/backend.ts:95-99`):
  - `registerHostSystem` twice and `registerHostPlugin` once;
  - `HOST_PLUGIN_EVENT_TYPES` (`@abuddy/sdk/events`) for `application`'s plugin.
- Registry (`packages/abuddy-host/src/packs/pack-registration.ts`):
  - `hostSystems` and `hostPlugins` maps, and `hostPluginEventTypes()`;
  - host branches in `getRegisteredSystems`, `buildEventValidationMap` and `buildPluginEventValidationMap`;
  - its own cache resets in `registerHostSystem`/`registerHostPlugin`, outside `changed()`.
- Renderer:
  - `main.ts:105` appends `packsPlugin` to the registered plugins by hand;
  - `application.ts:482` finds `resolveName('host/packs')` to insert pack plugins before it.

**Replace with.**
- The API registers `{ id: HOST_PACK_ID, features: { application: { system, plugin }, packs: { system, plugin } } }`
  through `registerPack`.
- The renderer registers the host's frontend through `registerPackFE`.
- The reserved-id check already keeps any other pack from using `host`.
- `HostPluginEvents` stays, as the type a pack's `sendsTo` is checked against.

**Removes** `registerHostSystem`, `registerHostPlugin`, the two maps and their branches, and
`HOST_PLUGIN_EVENT_TYPES` as a registry input. `bus` isn't a feature (it's the root machine), so it stays a constant.
The Packs tab sorting last becomes an explicit order rule rather than an index lookup.

## S2. Declare the host's refs once

**What exists.** The host's refs are built in four places:

- `bus` in `packages/abuddy-host/src/bus/machine.ts:12`;
- `application` in `packages/abuddy-host/src/bus/application-system.ts:12`;
- `packs` in `packages/abuddy-host/src/packs/runtime/packs-system.ts:44`;
- `packs` again in `packages/renderer/src/packs/state.ts:12`.

They're also written out as `'host/…'` literals in about eight places:

- `sdk/events/index.ts`, `sdk/logger/report-error.ts`;
- default-setup's `settings/be/system.ts` (4) and `onboarding-helpers.ts`;
- `renderer/.../application.ts:87,482`. Line 482 also runs `resolveName` on a ref that is already absolute, which
  does nothing.

**Replace with** one `HOST` table (`{ bus, application, packs }` as `FeatureRef`s) that host code imports. With S1,
the host's registration defines it. Pack code keeps writing `'host/application'`, which its generated types check.

## S3. Key the frontend registration by feature, like the backend

**What exists.**
- The backend registration is `features: { notes: { designation, system, plugin, settings } }`.
- The frontend is `plugins: { notes }`, plus `designations: { role: 'notes' }` and `defaultPlugin: 'notes'`: three
  maps that name the same features and must agree.
- So `registerPackFE` looks each role and the default back up (`byFeature.get(...)`). It silently skips a role
  whose feature has no plugin, and only warns on an unknown default.

**Replace with** `features: { notes: { plugin, designation?, default? } }` in `PackFERegistration`.
- Codegen writes both entries from one loop over the manifest's features.
- The store reads each feature once.
- The lookups, the silent skip and the warning go: a role or default can't name a missing feature.

## S4. One way to register and undo a pack's contributions

**What exists.**
- The backend registry lists what a pack contributes as a `contributions` table. There's one entry per kind, each
  recording its own undo (`pack-registration.ts`).
- `registerPackFE` (`packages/abuddy-host/src/fe/pack-store.ts`) does the same work as straight-line code: plugins,
  roles, tiptap plugins, app extensions, artifacts, blocks, steps, DSL types.
- Its step, artifact and block loops match the backend's line for line.
- Conflicts are handled differently: a role another pack holds is refused on the backend and warned about on the
  frontend.

**Replace with** the table on the frontend too, and share the entries for definition stores (steps, artifacts,
blocks) between the two registries. Pick one conflict policy. With S3, refusing is simplest: the backend already
refused the pack, so the frontend case can only arise from a hand-built registration.

Also: `FePackRegistry.registerPackFE` has two doc comments. The first (`pack-store.ts:27`) describes the removed
"without a pack id" behaviour.

## S5. Generate the send-key maps once

**What exists.** `generateEvents` (`packages/abuddy-sdk/src/build/generate-entries.ts`) emits four key maps over two
spellings:

- `PackEvents` and `SendableSystemEvents` for pack code: own features bare, others `<pack>/<feature>`;
- `QualifiedPluginEvents` and `QualifiedSystemEvents` for actions: everything `<pack>/<feature>`.

Each is assembled as a string from a `qualified(...)` mapped-type template that lives inside the generator.

**Replace with** two SDK type helpers:

- `Qualified<PackId, Map>` keys a map `<pack>/<feature>`;
- `WithOwnNames<PackId, QualifiedMap>` adds the bare aliases of the pack's own features.

Codegen emits the two qualified maps and derives the other two in one line each. The logic moves out of a template
string and into types that can be tested and documented. The generated file shrinks, and so does the generator.

## S6. One resolver for "a name that must be registered"

**What exists.** Three copies of "resolve a name, check it is registered, else throw listing what is":

- `resolveSystemId` and `resolvePluginId` in `packages/abuddy-testing/src/app.ts:177,188`;
- `registeredRef` for `services.emitter` in `packages/abuddy-sdk/src/services/index.ts`, with a "did you mean".

**Replace with** `resolveRegistered(kind, name, { packId, registered })` beside `resolveName` in `@abuddy/sdk/ids`.
All three call it, and the error text, including the hint, is written once.

## S7. One helper for event-type lists pinned to a type

**What exists.** Four hand-maintained runtime lists of event types:

- `SYSTEM_EVENT_TYPES`, `PLUGIN_EVENT_TYPES` and `HOST_PLUGIN_EVENT_TYPES` in `@abuddy/sdk`;
- `PACKS_PLUGIN_EVENT_TYPES` in the packs system.

Three of them carry a hand-written compile-time pin, each written differently. `SameMembers` and `TypeOfEvent` are
copied in `sdk/events/index.ts` and `host/packs/runtime/packs-system.ts`.

**Replace with** one SDK helper: `eventTypes<E>()(...types)`, which fails to compile unless the list is exactly
`E['type']`. The three pins and the two copies go. With S1, the host lists become its features' `receives`.

## S8. Let the typed sends express "an event every system takes"

**What exists.** default-setup's settings system tells every feature, in any pack, that its settings changed. The
typed sends can't name another pack's feature it doesn't depend on, so it casts them
(`settings/be/system.ts:69-70`, `sendToAnySystem`/`sendToAnyPlugin`).

**Replace with** typed sends that accept the events every system takes (`SystemEvents`) and every plugin takes
(`FeatureSettingsUpdated`) for any `FeatureRef`. The casts go, and the settings system's broadcast type-checks like
any other send.

## S9. Settings keys: one type, one resolver, one check

**What exists** in `default-setup/src/features/settings/plugin-settings.ts` and the settings system:

- `PluginSettingsKey` is `` `${string}/${string}` `` and duplicates `FeatureRef`;
- `pluginSettingsKey(name)` just returns `ref(name)`;
- `updateSettings` checks a plugin label twice, with `splitRef` and then `checkedPluginSettingsKey`;
- sending `SETTINGS_UPDATED` to the settings plugin and `APPLICATION_HOTKEYS` to the shell is written out in four
  actions: startup, update, replace and reset.

**Replace with** settings keyed by `FeatureRef` and `ref(name)` used directly. `updateSettings` validates once. One
`broadcastSettings({ hotkeys })` action serves all four.

## S10. Derive `visiblePlugins` instead of storing it

**What exists.** `visiblePlugins` is kept in the application actor's context and recomputed from `plugins` and
`pluginVisibility` at five sites (`packages/renderer/src/core/actors/application.ts:489,598,616,633,649`). A sixth
place that changes either input and forgets to recompute leaves the sidebar stale.

**Replace with** a selector over `plugins` and `pluginVisibility`, with the field removed from the context.

## S11. Put the pre-0.3.15 key moving in one host place

**What exists.**
- `addressPluginKeys`, `pluginRefOf` and `PluginOwners` are public API of `@abuddy/sdk/framework`
  (`etc/framework.api.md`).
- They run on every `PACK_CHANGED`, in two systems:
  - the host's `application` system, `addressShellState`;
  - default-setup's settings system, `addressStoredPluginKeys`.
- They also have three migration call sites, each with its own `movesTo`/owners configuration.
- All of it serves one move: pre-0.3.15 bare keys onto refs.

**Replace with** one host-owned step, run when a pack registers, that re-addresses both the shell state and the
settings row. The host migration already writes the settings row directly. The SDK export and both systems' hooks
go.

The move then lives in one place, which can be deleted once no supported upgrade starts below 0.3.15. It becomes
part of the pack contract only if a pack ever needs it, and then marked `@internal` (`_addressPluginKeys`).

## S12. One word for the concept

**What exists.** The type and its helpers say *ref* (`FeatureRef`, `splitRef`, `ref()`). The rest mixes three
words for the same thing:

- *address*: `navigateToAddress`, about 60 uses in code and comments, and user-facing errors such as
  "keyed by its address";
- *id*: `Plugin.id`, which holds a ref;
- *pluginId*: the fields of the shell's events (`SELECT_PLUGIN`, `SET_PLUGIN_VISIBILITY`, `SET_LAST_ACTIVE_PLUGIN`).

**Replace with** *ref* throughout: `navigateToAddress` → `openRef` (beside `openPlugin`), event fields named
`plugin`, and comments and error text updated. Mechanical, but it's what someone reading the code cold relies on.

## S13. Leftovers

- `generateFe` writes its own `const packId` plus `resolveName` into `#generated/fe.ts`, while `#generated/ref.ts`
  already exports the pack-bound `ref`. It should import that.
- `PackFERegistration.defaultPlugin`'s doc comment ("unless another pack's already does") describes store policy,
  not the field. Covered by S3.

## Suggested order

Each step can land on its own:

1. S13, S9, S10 and S12: local and mechanical.
2. S6 and S7: small shared helpers, each deleting two or three copies.
3. S5 and S8: send-type helpers, one generator change, and `api:update`.
4. S3, then S4: the frontend registration's shape, then the store over it.
5. S1, then S2: the host as a pack. S2 needs S1 for its full form, but its constant table can land first.
6. S11, on its own, because it touches the 0.3.15 migration's stored-data path.
