# Review: feature identity cleanup, second pass

Reviewed at `b753a99dc` (branch `AS/designations-and-addressing`), after every item of
`review-feature-identity-cleanup.md` landed (`7af49d2c7`), designations addressed by role (`6eb47edc7`), and the
backwards-compat paths were dropped (`b753a99dc`). Same scope: the identity and messaging code, and the files it
touches.

The first pass removed the structural duplication. What's left is smaller: a dead member, a few values declared
in more than one place, two entry points where one does, and some leftover casts and loops. Each item says what
exists and what would replace it. None changes behaviour, apart from the error messages named in T6.

## T1. `builtInPackIds` has no consumer

`PackRegistryView.builtInPackIds()` (`packages/abuddy-sdk/src/runtime/packs-view.ts:43`) was there for the SDK's
key-moving helpers. Those moved into the host's 0.3.15 migration, which uses `builtInPacks()`. The view member,
its implementation (`packages/abuddy-host/src/packs/pack-registration.ts:516`) and the test stand-in
(`packages/abuddy-sdk/src/testing/packs.ts:96`) are now dead. Remove all three and run `api:update`.

## T2. The host's features are listed in several places

- `HOST` (`packages/abuddy-host/src/host-refs.ts`): `bus`, `application`, `packs`.
- `hostRegistration` (`packages/abuddy-host/src/packs/host-pack.ts`) writes the feature keys `application` and
  `packs` again.
- `HostPluginEvents` / `HOST_PLUGIN_EVENT_TYPES` key `'host/application'` as a literal.
- `APPLICATION_SYSTEM_EVENTS` (`packages/abuddy-host/src/bus/application-system.ts`) is a hand list of the
  application system's client events. It's the one event-type list that `eventTypes<E>()` doesn't check (S7 of the
  first pass).

**Replace with** `hostRegistration` naming its features from `HOST`, and `APPLICATION_SYSTEM_EVENTS` built with
`eventTypes<ApplicationEvent>()`. Split `ApplicationEvent` so the list covers exactly the events a client may send,
not `PACK_CHANGED`, which the bus sends.

## T3. `application` is a second name for `HOST.application`, declared twice

`packages/abuddy-host/src/bus/application-system.ts:12` and `packages/renderer/src/core/actors/application.ts:98`
each export `application = HOST.application`. `main.ts` and `packs/state.ts` import the renderer's. Use
`HOST.application` everywhere and delete both aliases, so one ref has one name.

## T4. The shell's events are declared three times

`HostPluginEvents['host/application']` (`packages/abuddy-sdk/src/events/index.ts:94-97`) is the source. It's
repeated by:

- `ApplicationConnectedEvent` (`packages/abuddy-host/src/bus/app-bus.ts:13`);
- the renderer's `ApplicationEvent` members `CLIENT_CONNECTED`, `APPLICATION_HOTKEYS` and `PLUGIN_VISIBILITY_UPDATED`
  (`packages/renderer/src/core/actors/application.ts:122-125`).

**Replace with**
`type ApplicationConnectedEvent = Extract<HostPluginEvents['host/application'], { type: 'CLIENT_CONNECTED' }>`, and
the renderer's union including `HostPluginEvents['host/application']`. A field added in one place then reaches the
other two, and can't drift.

## T5. `openPlugin` and `openRef` are one function

`openPlugin(ref: string)` (`packages/abuddy-sdk/src/fe/navigation.ts`) checks the string with `splitRef` and calls
`openRef`. `openRef` then refuses anything that isn't a registered plugin, which covers every malformed string. The
only difference is the parameter type.

**Replace with** one `openPlugin(ref: string)`, which the host, `#generated/fe`'s `navigateToPlugin` and the data
call sites (`LinkBlock`, `PluginsTab`) all use. One export goes, along with the "code-known versus data-borne door"
distinction, which no longer does anything.

## T6. Let the designation store refuse a taken role

- `registerPack` (`pack-registration.ts`) checks role collisions in its own loop before registering anything, then
  registers the roles as its last contribution.
- `registerPackFE` (`packages/abuddy-host/src/fe/pack-store.ts`) checks in its designations contribution. Its
  error says "vs the plugin that plays it" and doesn't name the pack.
- `createDesignationStore` (`packages/abuddy-host/src/packs/extensions.ts:67`) itself accepts any overwrite.

**Replace with** `register` refusing a role that's already held, and naming the holder's pack from its ref
(`splitRef(roles.get(role)).packId`). Both registries run it inside `addContributions`, which already takes back
everything on a throw. That deletes the backend pre-loop and the frontend check, and both errors name the pack.

The service and repository collision loops in `registerPack` are the same "first key another pack holds" search,
each written differently. A `firstTaken(mine, holders)` helper serves both. Services also check the host's names.

## T7. Early systems are rediscovered on every incoming message

`createAppBus` filters every incoming message with `registry.getEarlySystems().some(...)`
(`packages/abuddy-host/src/bus/app-bus.ts:33`). `getEarlySystems()` rebuilds its list by walking every registered
pack's features on each call. Meanwhile `startEarlySystems`, in the same file, holds the early actors and delivers
their messages itself. Two places each know which systems are early, and one of them recomputes it per message.

**Replace with** one owner. Either `startEarlySystems` returns its refs as a `Set` for the bus to skip, or the bus
machine is handed the early actors and routes to them in `routeIncoming` like any system, so `startEarlySystems`
only starts them.

## T8. `isRecord` five times, and two deep merges

`isRecord` is written out in:

- `packages/abuddy-host/src/migrations/app/0.3.15.ts:122`;
- `packages/abuddy-sdk/src/framework/pack-settings.ts:22`;
- `packages/default-setup/src/features/settings/merge-settings.ts:2`;
- `packages/default-setup/src/seeds/_compilers/settings.ts:14`;
- `packages/default-setup/src/extensions/steps/create/build.ts:27`.

`mergeUnder` (the migration) and `mergeSettings` (default-setup) are the same merge: nested objects merge, and
anywhere else the second value wins.

**Replace with** `isRecord` and `deepMerge` in `@abuddy/sdk/utils/pure`, imported by each.

## T9. The generated send-type names don't pair up

`#generated/events` exports:

- `PackEvents` and `OwnPackEvents`, for plugins;
- `PackSystemEvents` and `SendableSystemEvents`, for systems;
- `QualifiedPluginEvents` and `QualifiedSystemEvents`, for actions.

"PackEvents" means the plugins' events, and nothing marks it as the plugin half of `SendableSystemEvents`. Rename
to `SendablePluginEvents` and `OwnPluginEvents`, update the facades and `etc/pack-types.api.md`, and run
`facade:update`.

The generated comments on `PackEvents` and `SendableSystemEvents` also say a pack's own features are named "also by
feature id". `WithOwnNames` *replaces* their refs with bare names, as its own doc says. Correct the generator's
comment.

## T10. The frontend store normalizes each registration three times

`pluginsOf(registration)` (`pack-store.ts`) builds fresh plugin objects `{ ...feature.plugin, id }`. It's called by
three contributions: plugins, default and designations. Because each call makes new objects, the default
contribution re-finds its plugin in `allPlugins` by id to get the object that was registered.

**Replace with** normalizing once in `registerPackFE` and passing the result to the contributions: the registration
plus its addressed plugins. The re-find goes.

The "push onto a list, splice it back out" contribution is written twice, for `allPlugins` and for `tiptapPlugins`.
A small `listed(list, items)` helper serves both.

## T11. Settings: a re-validation and two casts

- `tellChangedFeatures` (`packages/default-setup/src/features/settings/be/system.ts`) checks each key with
  `splitRef`, then passes it to `resolveName`, which validates the same string again. Use the ref `splitRef`
  already accepted.
- `updateSettings` casts the label to `` `${string}/${string}` `` for `settingsCommands.updateSettings`, which then
  checks it at runtime (`checkedSettingsRef`) anyway. Type the command's label `string` and let the check stand
  alone. The `testCliProvider` and migration callers pass `ref(...)` and are unaffected.

## T12. The panel sizes are saved by six copies of one line

`localStorage.setItem('agentbuddy-panel-sizes', JSON.stringify(newSizes))` appears six times in
`packages/renderer/src/core/actors/application.ts` (`:737`, `:830`, `:843`, `:848`, `:864`, `:890`), once per action
that changes a size. Next to them are the actor's identity changes. Saving whenever `panelSizes` changes, in one
subscription or one `savePanelSizes` action, removes the copies, and a new resize action can't forget to save.

## Suggested order

Each step can land on its own:

1. T1, T3, T9 (the rename and the comment) and T11: removals and renames.
2. T2 and T4: one source for the host's features and the shell's events.
3. T5 and T6: one navigation entry point, and the store refusing taken roles.
4. T7, T8, T10 and T12.
