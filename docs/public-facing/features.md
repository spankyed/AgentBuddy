# Features — Systems & Plugins

A **feature** is the primary unit of pack functionality. It bundles a backend system (XState state machine), a frontend plugin (sidebar tab with canvas/panel UI), settings, and services into a single declaration.

## Scaffolding

```bash
abuddy add feature bookmarks --label "Bookmarks" --icon "Bookmark"
```

| Flag | Default | Effect |
|---|---|---|
| `--label <Label>` | derived from the name | The plugin module's `label` |
| `--icon <LucideIcon>` | `Box` | The icon the plugin module imports and sets as its `icon` |
| `--designation <role>` | none | Writes `"designation"`: the role the feature plays, which need not be its name |

The feature name is the feature id: it must match `^[a-z][a-zA-Z0-9]*$` (a lowercase letter, then letters and digits: `notes`, `calendarEvents`), because it becomes an identifier in generated code, and part of the feature's ref, `<packId>/<featureId>`.

This creates:

```
src/features/bookmarks/
  settings.ts                    # Default settings
  be/
    system.ts                    # Backend XState machine
    types.ts                     # Shared types
    repository/
      index.ts                   # bookmarksQueries / bookmarksCommands (declared in abuddy.json repositories)
  fe/
    plugin.ts                    # Frontend plugin definition
    state.ts                     # Frontend XState machine
    canvas/
      list.vue                   # Main view component
    settings.vue                 # Settings panel
tests/unit/
  bookmarks-system.spec.ts       # System test on @abuddy/testing/harness
```

It also adds the feature to `abuddy.json` and regenerates `__generated__/`. A pack without `tests/setup.ts` also gets the unit test setup the system test runs on: `tests/setup.ts`, `vitest.config.ts` when it has no Vitest config, and the test dev dependencies.

## Backend system

Every system is an XState state machine that communicates via a central event bus.

### Defining a system

```typescript
// src/features/bookmarks/be/system.ts
import { setup } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';
// broadcastToPlugin is typed with the events each of this pack's plugins receives
import { broadcastToPlugin } from '#generated/events';

// Define event contracts (CLIENT_CONNECTED is added by defineSystem)
type IncomingBookmarksEvents =
  | { type: 'CREATE_BOOKMARK'; url: string; title: string };

export type OutgoingBookmarksEvents =
  | { type: 'BOOKMARKS_CONNECTED'; data: BookmarkDTO[] }
  | { type: 'BOOKMARK_CREATED'; bookmark: BookmarkDTO };

// Create the system spec: the events it receives and sends. Its identity is its feature's, from abuddy.json
export const bookmarksSpec = defineSystem<
  IncomingBookmarksEvents,
  OutgoingBookmarksEvents
>();

// Build the machine
export const bookmarksSystem = setup({
  types: bookmarksSpec.types,
  actions: {
    sendConnectedData: () => {
      broadcastToPlugin('bookmarks', {
        type: 'BOOKMARKS_CONNECTED',
        data: [],
      });
    },
  },
}).createMachine({
  id: 'bookmarks',
  initial: 'idle',
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: { actions: 'sendConnectedData' },
      },
    },
  },
});

// Default-export the entry — this is what the manifest loads. `satisfies` (not a type annotation)
// keeps the spec's events, which #generated/events types sendToSystem with
const bookmarksEntry = {
  spec: bookmarksSpec,
  machine: bookmarksSystem,
} satisfies SystemEntry;

export default bookmarksEntry;
```

`defineSystem<TEvents, TOutgoing, TContext = {}>()` returns the spec. It takes no id: the system is its feature's, which the manifest names it under, and runs at the feature's ref, `<packId>/<featureId>`; code names it by the feature id (see below).

| Member | What it is |
|---|---|
| `types` | `{ context: TContext; events: TEvents \| SystemEvents }`, for `setup({ types })`. `SystemEvents` is `CLIENT_CONNECTED`, `PACK_CHANGED { packId }` and `FEATURE_SETTINGS_UPDATED { settings, changes }`, so incoming unions needn't list them |
| `typeOf` | `safeEvents` over the same events, to narrow an event by type in actions |

`TOutgoing` is every event the system sends to plugins, and the one place they're declared: the build reads it from the spec to type `broadcastToPlugin` and to list what each plugin receives. Export the union from `system.ts` under any name, and have the plugin's machine import that type.

### Key rules

- **Default-export the `SystemEntry`, declared with `satisfies SystemEntry`** — an annotated entry (`const entry: SystemEntry = …`) loses the system's events. `abuddy build` then fails, naming the system. The fix is `satisfies SystemEntry`. Every module the manifest points at (`system.ts`, `fe/plugin.ts`, `fe/state.ts`, `settings.ts`) default-exports its single definition. Named exports alongside it are fine; the default is what gets loaded.
- **Always handle `CLIENT_CONNECTED`** — this event fires when the frontend connects. An installed pack with frontend code (an FE entry or plugins) gets it instead once each window has tried loading that frontend, at startup, on activation and when the window reconnects, whether the load added plugins or failed; every system of the pack gets it, those without a plugin too. A pack without frontend code gets it on activation as well. A reloaded pack's systems get it too. Every open window receives the data sent in reply, not only the one that asked. Send the full initial state back to the plugin via the bus each time; the plugin doesn't need to ask for it.
- **Handle `PACK_CHANGED` when you list what packs register or seed** — every running system gets it once a pack is installed, updated, enabled, disabled, uninstalled or rebuilt while the app runs, or its seeds are imported from Settings. default-setup's library, notes, flows, actions and prompts systems send their startup data again, and threads sends the slash commands when they changed.
- **Use `broadcastToPlugin()` to send to the frontend** — `broadcastToPlugin(name, event)`, in a system's actions or anywhere else (services, callbacks), routes the event through the bus to the plugin that name stands for, in **every** window showing it (a plugin runs once per window). The renderer's own `sendToPlugin(name, event)`, from the same module, goes to one window's actor instead. It's dropped while no client is connected, so send startup data when a system receives `CLIENT_CONNECTED`. It comes from `#generated/events` and accepts only the events that plugin receives. Don't import it from `@abuddy/sdk/events`, whose untyped version accepts any event. Only features that have a `plugin` are named there: a feature with a system and no plugin has nothing to receive events, so it gets no key. A plugin that should also take events from another feature or another pack declares them itself, with `pluginAccepts()` beside it in `fe/plugin.ts` — the receiver says what it handles, so a pack widens only its own plugins.
- **An event arrives exactly as you sent it** — where it goes travels beside it (`{ to, event }`), so any field name is yours to use, `pluginId` included.

### Communication patterns

Your code names features: your own by id (`'bookmarks'`), and every other as `<packId>/<featureId>` (`'default-setup/logs'`; the app is the pack `host`, so its plugin is `'host/application'`). Every API that reaches a system or plugin takes that name. A feature's system and plugin both run under its ref, `<packId>/<featureId>`, the same spelling you write for another pack's features: a bare name is only short for your own pack's. Actions name systems and plugins `<packId>/<featureId>`, their own pack's included (see [`services.emitter`](services-and-data.md#host-services)).

| To | Use |
|---|---|
| send to a plugin from a system | `broadcastToPlugin(name, event)` (`#generated/events`) — every window |
| send to a plugin from the frontend | `sendToPlugin(name, event)` (`#generated/events`) — this window |
| send to a system, from a plugin or from another system | `sendToSystem(name, event)` (`#generated/events`), typed with the events that system declares |
| send to whichever system plays a role | `sendToSystem({ role }, event)`: `sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType })` fires a flow event |
| reach your plugin's actor from its components | `usePlugin<MyActor>()` (`@abuddy/sdk/fe`): the app renders a plugin's canvas, panel, chat and settings as part of it. Name your machine's actor type — which plugin a component belongs to is where it is rendered, so nothing at the call site can infer it, and an unnamed one would read a context field your machine dropped and still compile |
| read another plugin's state | `usePluginState(ref, selector)` (`@abuddy/sdk/fe`) in a component's setup or an effect scope, and `readPluginState(ref, selector)` once, outside one (a machine's action). Both take the plugin at a ref and hand back a value, never its actor; the reactive one follows it until the calling scope is disposed. Use them where `usePlugin()` has nothing to read — an extension component the app renders wherever it belongs, or your `fe/public.ts` |
| declare what other plugins may send yours | `export const accepts = pluginAccepts<MyInbox>()` beside the plugin in `fe/plugin.ts`. Your own feature's system needs no declaration — its outgoing events are already your plugin's. This is the published half: it is what a pack that depends on yours may send, and what types `sendToPlugin` and `navigateToPlugin` |
| offer another of your features your plugin's state or events | export composables and functions from the feature's `fe/public.ts`; a feature imports nothing else of another's frontend (`check:specifiers`) |
| open a plugin, optionally handing it events | `navigateToPlugin(name, event?)` (`#generated/fe`), which takes only the names your pack can write: its own features' and its dependencies'. The events are that plugin's inbox, the same `sendToPlugin` takes — this hands them to its actor too |
| open a plugin a piece of data names (a link's target) | `openPlugin(ref, event?)` (`@abuddy/sdk/fe`). It throws for a string that isn't a `<packId>/<featureId>`; otherwise the app opens the plugin, waiting while the pack that provides it is still loading, and tells the user if no installed pack provides it |

```typescript
import { broadcastToPlugin, sendToSystem } from '#generated/events';

// System -> Plugin (via bus)
broadcastToPlugin('bookmarks', { type: 'BOOKMARK_CREATED', bookmark });

// System -> System (via bus), checked against what the tags system declares it receives
sendToSystem('tags', { type: 'SOME_EVENT' });
```

Frontend code (and backend code) sends events to systems with `sendToSystem` from `#generated/events`:

```typescript
import { sendToSystem } from '#generated/events';

// Plugin -> System: this pack's systems by feature id, a dependency's as <dependency>/<feature>
sendToSystem('bookmarks', { type: 'CREATE_BOOKMARK', url, title });
sendToSystem('default-setup/notes', { type: 'GET_TRASHED_NOTES' });
```

`sendToSystem` accepts only systems of your pack and its dependencies, and only the events each one declares (`defineSystem<Incoming>()`); a missing field is reported against the event its `type` names. Each send names one system and one event type: a `systemId` or `type` typed as a union is rejected. A bare name is your own feature (`'bookmarks'` is `my-pack/bookmarks`). A dependency's system is always named with the dependency's id, so a feature of yours may share its name: `'notes'` is your own, `'default-setup/notes'` default-setup's. The app rejects an unknown `systemId`, and an event `type` none of the machine's transitions names unless the feature lists it in `system.events.incoming`.

Backend code that needs the connection or every incoming event subscribes with `onConnected(callback)` and `onIncoming(callback)` from `@abuddy/sdk/events`; each returns an unsubscribe function. Log entries arrive through `onLog(callback)` from `@abuddy/sdk/logger`.

### Logging and errors

- `createLogger(source)` from `@abuddy/sdk/logger` logs with your source; its entries reach the app's log. `createLogger(source, { debug: true })` logs `debug` messages only while `setDebugEnabled(source, true)` is in effect (on by default outside production). Backend pack code doesn't call `console.*`.
- `reportError({ error, source, title?, operation?, entityId?, severity?, userMessage? })` logs an error and shows it to the user. A flow step passes `step: { phase, tNodeId, nodeId, … }` instead: the error is recorded on the step's trace node and shown in the flow, and `reportError` returns it for `actor.send({ type: 'ERROR', error })`.

## Frontend plugin

### Defining a plugin

```typescript
// src/features/bookmarks/fe/plugin.ts
import type { PluginDefinition } from '@abuddy/sdk/fe';
import { Bookmark } from 'lucide-vue-next';
import state from './state';
import canvas from './canvas/list.vue';

// No id: the app registers the plugin at its feature's ref, `<packId>/bookmarks`
const bookmarksPlugin: PluginDefinition = {
  label: 'Bookmarks',
  icon: Bookmark,        // Lucide component, not a string
  state,                 // XState machine definition
  canvas,                // Main view component (required)
  // panel,              // Optional side panel component
};

export default bookmarksPlugin;
```

### Plugin interface

| Field | Type | Required | Description |
|---|---|---|---|
| `label` | `string` | yes | Sidebar tab label |
| `state` | `AnyStateMachine` | yes | XState machine definition |
| `icon` | `Component` | no | Lucide Vue component. The toolbar lists only plugins with an icon |
| `canvas` | `Component \| Record<string, Component>` | no | Main content area: one component, or route name → component for a plugin with several views |
| `panel` | `Component` | no | Side panel component |
| `chat` | `Component` | no | Chat area component; the app renders the default plugin's |
| `settings` | `Component` | no | Shown in Settings → Plugins; plugins without one aren't listed there |
| `isPinned` | `boolean` | no | Lists the plugin in the toolbar's pinned group |
| `hotkeys` | `PluginHotkeyDefinition[]` | no | `{ action, global? }` per hotkey action. The active plugin's machine gets every hotkey event; other plugins' machines get only their `global` actions |
| `options` | `{ headerClass?: string }` | no | Class for the canvas header |

### Frontend state machine

```typescript
// src/features/bookmarks/fe/state.ts
import { setup, type ActorRefFrom } from 'xstate';

// The feature's name: the machine's id, and how the pack's code sends to and looks up this plugin
export const id = 'bookmarks';
export type BookmarksState = ActorRefFrom<typeof bookmarksState>;

const bookmarksState = setup({
  types: {
    context: {} as { items: unknown[] },
    events: {} as
      | { type: 'BOOKMARKS_CONNECTED'; data: unknown[] }
      | { type: 'BOOKMARK_CREATED'; bookmark: unknown },
  },
}).createMachine({
  id,
  initial: 'idle',
  context: { items: [] },
  states: {
    idle: {},
  },
});

export default bookmarksState;
```

### Useful SDK utilities

```typescript
import { safeEvents } from '@abuddy/sdk/fe';       // Typed event handling
import breadcrumb from '@abuddy/sdk/fe';             // Navigation breadcrumbs
import { breadcrumbWithParams } from '@abuddy/sdk/fe'; // Parameterized navigation
```

## Settings

Each feature declares its default settings slice:

```typescript
// src/features/bookmarks/settings.ts
export default {
  visible: true,  // Show in sidebar
  plugins: {
    bookmarks: {
      // Feature-specific defaults
      syncInterval: 300,
    }
  }
}
```

- `visible` controls whether the plugin's sidebar tab shows by default (it shows when omitted). What the user shows or hides is the app's own state, kept by the host (`host/application`), and wins over it.
- Feature-specific settings go under the plugin ID key.
- A feature sets only its own slice, `plugins.<feature id>`, and `visible`. `abuddy build` fails on anything else (the app's `general` settings, another plugin's), and the app refuses to register such a pack.
- The settings are defaults: when your pack is enabled they join the app's defaults, and what the user changes is stored over them. Disabling the pack removes its defaults; a new version's defaults apply to every key the user didn't change.
- Read them at runtime with the app's settings service, `services.settings.forFeature('<packId>/<feature id>')`, which returns the user's values over the defaults; `setForFeature('<packId>/<feature id>', path, value)` changes one. Both take the feature's ref and throw for a bare name, naming the ref they likely meant. In a component, `useFeatureSettings(ref('<feature id>'))` from `@abuddy/sdk/fe` follows them, and `useSettingsSave()` gives the same change with whether the store stored it.
- When a feature's settings change, however they changed (a setting, the settings replaced or reset, a pack's defaults coming or going), its system gets `FEATURE_SETTINGS_UPDATED { settings, changes }` (`changes`: what changed in each list, by its key) and its plugin `FEATURE_SETTINGS_UPDATED { settings }`. Every system and plugin receives it, like `CLIENT_CONNECTED`: nothing declares it, and a feature without a system or a plugin just doesn't get that half.

## Manifest entry

`abuddy.json` is a feature's only configuration. The entry `abuddy add feature` writes:

```json
{
  "id": "bookmarks",
  "settings": "src/features/bookmarks/settings.ts",
  "system": {
    "entry": "src/features/bookmarks/be/system.ts"
  },
  "plugin": {
    "entry": "src/features/bookmarks/fe/plugin.ts"
  },
  "services": {},
  "repositories": {
    "bookmarksQueries": "src/features/bookmarks/be/repository/index.ts#bookmarksQueries",
    "bookmarksCommands": "src/features/bookmarks/be/repository/index.ts#bookmarksCommands"
  }
}
```

A feature can omit `system` (frontend-only) or `plugin` (backend-only). `services` and `repositories` are optional. The plugin's `label`, `icon` and `isPinned` live on the `PluginDefinition` the entry module default-exports; the manifest names only the module. Each service entry names the service object a module exports, `"bookmarks": "src/features/bookmarks/be/services/bookmarks.ts#bookmarksService"` (see [Services](services-and-data.md#services)); repositories work the same way (see [Repository pattern](services-and-data.md#repository-pattern)).

Other feature fields:

| Field | Effect |
|---|---|
| `system.events.incoming` | Event types the app accepts for the system (`sendToSystem`) besides those its machine's transitions name |
| `typesEntry` | Types module re-exported from `#generated/types`; default `src/features/<id>/be/types` |
| `earlySystem` | Built-in packs only |
| `references` | Built-in packs only; ignored for external packs |

A feature that fills a role other packs look up (`getDesignated('<role>')`, or `sendToSystem({ role }, event)`) sets `"designation"` to that role. A role is not a name: a feature `inbox` can play `notes`. `abuddy add feature bookmarks --designation bookmarks` writes it. One feature plays a role: `abuddy validate` reports two features of a pack claiming the same one, and the app refuses a pack claiming a role another pack plays. `abuddy validate` also reports a `settings`, `system.entry` or `plugin.entry` file that doesn't exist.

## Types dependents see

`abuddy build` bundles the types of what a pack exposes (entity shapes, events, services, repositories) into `dist/types/pack-types.d.ts`. Packs depending on it compile against that file, so the build fails when the bundle:

- doesn't type-check on its own, or
- imports a package other than `@abuddy/*`, `@abuddy/sdk`'s peer dependencies (`vue`, `xstate`, `zod`, `ai`, ...) or a Node built-in. For example, a service whose methods return a `Page` from `playwright`: a dependent doesn't have your pack's other dependencies installed, and would read those types as `any`, or
- imports an `@abuddy/*` module the published package doesn't export (`@abuddy/sdk/utils/internals`, which resolves only in a linked AgentBuddy checkout), or a private package (`@abuddy/host`), or
- imports a relative or absolute path: a facade bundle imports only packages, or
- imports a module that resolves to something without type declarations (a `.js` file), which dependents would read as `any`.

The error names the offending line of the bundle and the facade type that reaches it. Give the service or repository an explicit type written with your own types or allowed packages' types instead of one inferred from a library's.
