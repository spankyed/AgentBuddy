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
| `--designation <role>` | none | Writes `"designation"`; must equal the feature name |

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
import { bus } from '@abuddy/sdk/ids';
// emit is typed with the events each of this pack's plugins receives
import { emit } from '#generated/events';

// Define event contracts (CLIENT_CONNECTED is added by defineSystem)
type IncomingBookmarksEvents =
  | { type: 'CREATE_BOOKMARK'; url: string; title: string };

export type OutgoingBookmarksEvents =
  | { type: 'BOOKMARKS_CONNECTED'; data: BookmarkDTO[] }
  | { type: 'BOOKMARK_CREATED'; bookmark: BookmarkDTO };

// Create the system spec (identity + types)
export const bookmarksSpec = defineSystem('bookmarks')<
  IncomingBookmarksEvents,
  OutgoingBookmarksEvents
>();
export const bookmarks = bookmarksSpec.id;

// Build the machine
export const bookmarksSystem = setup({
  types: bookmarksSpec.types,
  actions: {
    sendConnectedData: ({ system }) => {
      system.get(bus).send(emit(bookmarks, {
        type: 'BOOKMARKS_CONNECTED',
        data: [],
      }));
    },
  },
}).createMachine({
  id: bookmarks,
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

`defineSystem(id)<TEvents, TOutgoing, TContext = {}>()` returns the spec:

| Member | What it is |
|---|---|
| `id` | The literal id you passed: the feature id, which is the name code sends to (`emit`, `sendToSystem`). The system runs under the feature's ref, `<packId>/<featureId>` (see below) |
| `types` | `{ context: TContext; events: TEvents \| SystemEvents }`, for `setup({ types })`. `SystemEvents` is `CLIENT_CONNECTED` and `PACK_CHANGED { packId }`, so incoming unions needn't list them |
| `typeOf` | `safeEvents` over the same events, to narrow an event by type in actions |

### Key rules

- **Default-export the `SystemEntry`, declared with `satisfies SystemEntry`** — an annotated entry (`const entry: SystemEntry = …`) loses the system's events. `abuddy build` then fails on the pack's types, with a type error that names the system (`my-pack/bookmarks`). The fix is `satisfies SystemEntry`. Every module the manifest points at (`system.ts`, `fe/plugin.ts`, `fe/state.ts`, `settings.ts`) default-exports its single definition. Named exports alongside it are fine; the default is what gets loaded.
- **Always handle `CLIENT_CONNECTED`** — this event fires when the frontend connects. An installed pack with frontend code (an FE entry or plugins) gets it instead once each window has tried loading that frontend, at startup, on activation and when the window reconnects, whether the load added plugins or failed; every system of the pack gets it, those without a plugin too. A pack without frontend code gets it on activation as well. A reloaded pack's systems get it too. Every open window receives the data sent in reply, not only the one that asked. Send the full initial state back to the plugin via the bus each time; the plugin doesn't need to ask for it.
- **Handle `PACK_CHANGED` when you list what packs register or seed** — every running system gets it once a pack is installed, updated, enabled, disabled, uninstalled or rebuilt while the app runs, or its seeds are imported from Settings. default-setup's library, notes, flows, actions and prompts systems send their startup data again, and threads sends the slash commands when they changed.
- **Use `emit()` or `sendToPlugin()` to send to the frontend** — inside a system's actions, `system.get(bus).send(emit(name, event))` routes the event through the bus to the plugin that name stands for; elsewhere (services, callbacks), `sendToPlugin(name, event)` sends it through the bus too. Either is dropped while no client is connected, so send startup data when a system receives `CLIENT_CONNECTED`. Both come from `#generated/events` and accept only the events that plugin receives. Don't import them from `@abuddy/sdk/events`, whose untyped versions accept any event. Only features that have a `plugin` are named there: a feature with a system and no plugin has nothing to receive events, so it gets no key. To send to another plugin, list it in the system's `sendsTo` in `abuddy.json`, named as code names it: another feature of this pack by id, a dependency's as `<packId>/<featureId>`, or the app's `host/application`. Without that the plugin isn't a key of `PackEvents` and the send doesn't compile; with it, `emit` and `sendToPlugin` take the same name (`emit('default-setup/logs', …)`). What the target then accepts depends on who owns it: **another feature of this pack** gains this system's outgoing events, because the pack owns that plugin's machine and can handle them; **a dependency's plugin or a host plugin** keeps the events its owner declares it receives (the dependency's own systems' outgoing events, or the host's `HostPluginEvents`), since only the pack that owns a plugin can handle a new event — `sendsTo` opens the channel there, it doesn't widen the type. `sendsTo` naming one of the pack's own features that has no plugin is a manifest error, and naming a dependency's plugin its own pack declares no events for is a build error: nothing could receive the events either way.
- **Never use `pluginId` as a field name in outgoing events** — the transport layer overwrites it. Use `targetId` or similar instead.

### Communication patterns

Your code names features: your own by id (`'bookmarks'`), and every other as `<packId>/<featureId>` (`'default-setup/logs'`; the app is the pack `host`, so its plugin is `'host/application'`). Every API that reaches a system or plugin takes that name. A feature's system and plugin both run under its ref, `<packId>/<featureId>`, the same spelling you write for another pack's features: a bare name is only short for your own pack's. Actions name systems and plugins `<packId>/<featureId>`, their own pack's included (see [`services.emitter`](services-and-data.md#host-services)).

| To | Use |
|---|---|
| send to a plugin from a system | `emit(name, event)` in a machine's actions, `sendToPlugin(name, event)` elsewhere (`#generated/events`) |
| send to a system | `sendToSystem(name, event)` (`#generated/events`) |
| reach another system's actor from a system | `actorOf(system, name)` (`#generated/events`), given the `system` an action receives |
| reach a plugin's actor from frontend code | `actorOf(name)` (`#generated/fe`) |
| open a plugin, optionally handing it events | `navigateToPlugin(name, event?)` (`#generated/fe`) |

```typescript
import { emit, actorOf } from '#generated/events';

// System -> Plugin (via bus)
system.get(bus).send(emit('bookmarks', { type: 'BOOKMARK_CREATED', bookmark }));

// System -> System (direct)
actorOf(system, 'tags').send({ type: 'SOME_EVENT' });
```

Frontend code (and backend code) sends events to systems with `sendToSystem` from `#generated/events`:

```typescript
import { sendToSystem } from '#generated/events';

// Plugin -> System: this pack's systems by feature id, a dependency's as <dependency>/<feature>
sendToSystem('bookmarks', { type: 'CREATE_BOOKMARK', url, title });
sendToSystem('default-setup/settings', { type: 'GET_SETTINGS' });
```

`sendToSystem` accepts only systems of your pack and its dependencies, and only the events each one declares (`defineSystem(id)<Incoming>()`); a missing field is reported against the event its `type` names. Each send names one system and one event type: a `systemId` or `type` typed as a union is rejected. A bare name is your own feature (`'bookmarks'` is `my-pack/bookmarks`). A dependency's system is always named with the dependency's id, so a feature of yours may share its name: `'notes'` is your own, `'default-setup/notes'` default-setup's. The app rejects an unknown `systemId`, and an event `type` none of the machine's transitions names unless the feature lists it in `system.events.incoming`.

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
- Read them at runtime with default-setup's settings service, `services.settings.getPluginSettings('<feature id>')`, which returns the user's values over the defaults.

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
| `system.outgoingEventsType` | Name of the outgoing events type `system.entry` exports; default `Outgoing<FeatureId in PascalCase>Events`. Codegen types `emit` and `#generated/types` with it |
| `system.sendsTo` | Plugins besides its own this system sends to, named as code names them (own features by id, a dependency's `<packId>/<featureId>`, `host/application`), and the only ones outside its own feature `emit`/`sendToPlugin` accept. An own feature named here must have a plugin and gains this system's events; a dependency's plugin or a host plugin keeps its owner's event type (see [Key rules](#key-rules)) |
| `typesEntry` | Types module re-exported from `#generated/types`; default `src/features/<id>/be/types` |
| `earlySystem` | Built-in packs only |
| `references` | Built-in packs only; ignored for external packs |

A feature that fills a role other packs look up (`getDesignated('<role>')`) sets `"designation"` to its own id; `abuddy add feature bookmarks --designation bookmarks` writes it. `abuddy validate` reports a designation that differs from the feature id, and a `settings`, `system.entry` or `plugin.entry` file that doesn't exist.

## Types dependents see

`abuddy build` bundles the types of what a pack exposes (entity shapes, events, services, repositories) into `dist/types/pack-types.d.ts`. Packs depending on it compile against that file, so the build fails when the bundle:

- doesn't type-check on its own, or
- imports a package other than `@abuddy/*`, `@abuddy/sdk`'s peer dependencies (`vue`, `xstate`, `zod`, `ai`, ...) or a Node built-in. For example, a service whose methods return a `Page` from `playwright`: a dependent doesn't have your pack's other dependencies installed, and would read those types as `any`, or
- imports an `@abuddy/*` module the published package doesn't export (`@abuddy/sdk/utils/internals`, which resolves only in a linked AgentBuddy checkout), or a private package (`@abuddy/host`), or
- imports a relative or absolute path: a facade bundle imports only packages, or
- imports a module that resolves to something without type declarations (a `.js` file), which dependents would read as `any`.

The error names the offending line of the bundle and the facade type that reaches it. Give the service or repository an explicit type written with your own types or allowed packages' types instead of one inferred from a library's.
