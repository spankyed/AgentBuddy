# Features — Systems & Plugins

A **feature** is the primary unit of pack functionality. It bundles a backend system (XState state machine), a frontend plugin (sidebar tab with canvas/panel UI), settings, and services into a single declaration.

## Scaffolding

```bash
abuddy add feature bookmarks --label "Bookmarks" --icon "Bookmark"
```

| Flag | Default | Effect |
|---|---|---|
| `--label <Label>` | derived from the name | `plugin.label` and the plugin module's `label` |
| `--icon <LucideIcon>` | `Box` | `plugin.icon` and the imported icon |
| `--designation <role>` | none | Writes `"designation"`; must equal the feature name |

The feature name is the feature id: it must match `^[a-z][a-zA-Z0-9]*$` (a lowercase letter, then letters and digits: `notes`, `calendarEvents`), because it becomes an identifier in generated code (system exports, `busId` keys, settings keys, emit targets).

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

// Default-export the entry — this is what the manifest loads
const bookmarksEntry: SystemEntry = {
  spec: bookmarksSpec,
  machine: bookmarksSystem,
};

export default bookmarksEntry;
```

`defineSystem(id)<TEvents, TOutgoing, TContext = {}>()` returns the spec:

| Member | What it is |
|---|---|
| `id` | The literal id you passed (the feature id). The example uses it as the machine id and as the plugin id `emit` targets; it isn't the bus id of an external pack's system (see below) |
| `types` | `{ context: TContext; events: TEvents \| SystemEvents }`, for `setup({ types })`. `SystemEvents` is `{ type: 'CLIENT_CONNECTED' }`, so incoming unions needn't list it |
| `typeOf` | `safeEvents` over the same events, to narrow an event by type in actions |

### Key rules

- **Default-export the `SystemEntry`** — every module the manifest points at (`system.ts`, `fe/plugin.ts`, `fe/state.ts`, `settings.ts`) default-exports its single contribution. Named exports alongside it are fine; the default is what gets loaded.
- **Always handle `CLIENT_CONNECTED`** — this event fires when the frontend connects. An installed pack with frontend code (an FE entry or plugins) gets it instead once each window has tried loading that frontend, at startup, on activation and when the window reconnects, whether the load added plugins or failed; every system of the pack gets it, those without a plugin too. A pack without frontend code gets it on activation as well. A reloaded pack's systems get it too. Every open window receives the data sent in reply, not only the one that asked. Send the full initial state back to the plugin via the bus each time; the plugin doesn't need to ask for it.
- **Use `emit()` to send to the frontend** — `system.get(bus).send(emit(systemId, event))` routes the event to the matching frontend plugin. `emit` from `#generated/events` accepts only the events that plugin receives. To send to another plugin (another feature's, a dependency's, or the app's `application`), list it in the system's `sendsTo` in `abuddy.json`; its type then accepts this system's events.
- **Never use `pluginId` as a field name in outgoing events** — the transport layer overwrites it. Use `targetId` or similar instead.

### Communication patterns

A system's bus id is the feature id in a built-in pack, and `<packId>.<featureId>` in an external pack (`my-pack.bookmarks`). Plugin ids stay the feature id. Don't write bus ids by hand: `busId` from `#generated/bus-ids` maps each of your features that has a system to its bus id. The module has no imports, so frontend code can use it.

```typescript
import { busId } from '#generated/bus-ids';

// System -> Plugin (via bus): emit takes the plugin id
system.get(bus).send(emit(bookmarks, { type: 'BOOKMARK_CREATED', bookmark }));

// System -> System (direct)
system.get(busId.tags).send({ type: 'SOME_EVENT' });
```

The frontend sends events to systems via tRPC:

```typescript
import { trpc } from '@abuddy/sdk/rpc';
import { busId } from '#generated/bus-ids';

// Plugin -> System (from frontend)
trpc.bus.send.mutate({ systemId: busId.bookmarks, type: 'CREATE_BOOKMARK', url, title });
```

`trpc.bus.send` rejects an unknown `systemId`, and an event `type` none of the machine's transitions names unless the feature lists it in `system.events.incoming`.

## Frontend plugin

### Defining a plugin

```typescript
// src/features/bookmarks/fe/plugin.ts
import type { Plugin } from '@abuddy/sdk/fe';
import { Bookmark } from 'lucide-vue-next';
import state, { id } from './state';
import canvas from './canvas/list.vue';

const bookmarksPlugin: Plugin = {
  id,
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
| `id` | `string` | yes | Matches the feature ID |
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
| `designation` | `string` | no | Set from the manifest's `features[].designation` by the generated entry; declare it there, not in the module |

### Frontend state machine

```typescript
// src/features/bookmarks/fe/state.ts
import { setup, type ActorRefFrom } from 'xstate';

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
  plugins: {
    _meta: { visibility: { bookmarks: true } },  // Show in sidebar
    bookmarks: {
      // Feature-specific defaults
      syncInterval: 300,
    }
  }
}
```

- `_meta.visibility` controls whether the plugin's sidebar tab is visible by default.
- Feature-specific settings go under the plugin ID key.
- A feature sets only its own slice: `plugins.<feature id>` and `plugins._meta.visibility.<feature id>`. `abuddy build` fails on anything else (the app's `general` settings, another plugin's), and the app refuses to register such a pack.
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
    "entry": "src/features/bookmarks/fe/plugin.ts",
    "label": "Bookmarks",
    "icon": "Bookmark"
  },
  "services": {},
  "repositories": {
    "bookmarksQueries": "src/features/bookmarks/be/repository/index.ts#bookmarksQueries",
    "bookmarksCommands": "src/features/bookmarks/be/repository/index.ts#bookmarksCommands"
  }
}
```

A feature can omit `system` (frontend-only) or `plugin` (backend-only). `services` and `repositories` are optional. Each service entry names the service object a module exports, `"bookmarks": "src/features/bookmarks/be/services/bookmarks.ts#bookmarksService"` (see [Services](services-and-data.md#services)); repositories work the same way (see [Repository pattern](services-and-data.md#repository-pattern)).

Other feature fields:

| Field | Effect |
|---|---|
| `plugin.label` / `plugin.icon` | Name and Lucide icon name the manifest records for the plugin (pack listings use the label) |
| `plugin.isPinned` | Recorded in the pack's registration. The toolbar reads `isPinned` on the `Plugin` object, so set it there to pin the tab |
| `system.events.incoming` | Event types `trpc.bus.send` accepts for the system besides those its machine's transitions name |
| `system.events.outgoing` | Accepted by the schema; not read by codegen or the host |
| `system.outgoingEventsType` | Name of the outgoing events type `system.entry` exports; default `Outgoing<FeatureId in PascalCase>Events`. Codegen types `emit` and `#generated/types` with it |
| `system.sendsTo` | Plugins besides its own this system sends to (see [Key rules](#key-rules)) |
| `typesEntry` | Types module re-exported from `#generated/types`; default `src/features/<id>/be/types` |
| `earlySystem` | Built-in packs only |
| `contributions` | Built-in packs only; ignored for external packs |

A feature that fills a role other packs look up (`getDesignated('<role>')`) sets `"designation"` to its own id; `abuddy add feature bookmarks --designation bookmarks` writes it. `abuddy validate` reports a designation that differs from the feature id, and a `settings`, `system.entry` or `plugin.entry` file that doesn't exist.

## Types dependents see

`abuddy build` bundles the types of what a pack exposes (entity shapes, events, services, repositories) into `dist/types/pack-types.d.ts`. Packs depending on it compile against that file, so the build fails when the bundle:

- doesn't type-check on its own, or
- imports a package other than `@abuddy/*`, `@abuddy/sdk`'s peer dependencies (`vue`, `xstate`, `zod`, `ai`, ...) or a Node built-in. For example, a service whose methods return a `Page` from `playwright`: a dependent doesn't have your pack's other dependencies installed, and would read those types as `any`, or
- imports an `@abuddy/*` module the published package doesn't export (`@abuddy/sdk/ears/internals`, which resolves only in a linked AgentBuddy checkout), or a private package (`@abuddy/host`), or
- imports a relative or absolute path: a facade bundle imports only packages, or
- imports a module that resolves to something without type declarations (a `.js` file), which dependents would read as `any`.

The error names the offending line of the bundle and the facade type that reaches it. Give the service or repository an explicit type written with your own types or allowed packages' types instead of one inferred from a library's.
