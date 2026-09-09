# Features — Systems & Plugins

A **feature** is the primary unit of pack functionality. It bundles a backend system (XState state machine), a frontend plugin (sidebar tab with canvas/panel UI), settings, and services into a single declaration.

## Scaffolding

```bash
abuddy add feature bookmarks --label "Bookmarks" --icon "Bookmark"
```

This creates:

```
src/features/bookmarks/
  feature.config.ts              # Build-time config
  settings.ts                    # Default settings
  be/
    system.ts                    # Backend XState machine
    types.ts                     # Shared types
    repository/
      index.ts                   # EARS queries and commands
  fe/
    plugin.ts                    # Frontend plugin definition
    state.ts                     # Frontend XState machine
    canvas/
      list.vue                   # Main view component
    settings.vue                 # Settings panel
```

It also adds the feature to `abuddy.json` and regenerates `__generated__/`.

## Backend system

Every system is an XState state machine that communicates via a central event bus.

### Defining a system

```typescript
// src/features/bookmarks/be/system.ts
import { setup } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';
import { bus } from '@abuddy/sdk/ids';
import { emit } from '@abuddy/sdk/helpers';

// Define event contracts
type IncomingBookmarksEvents =
  | { type: 'CLIENT_CONNECTED' }
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

// Export the entry (required by the manifest)
export const bookmarksEntry: SystemEntry = {
  spec: bookmarksSpec,
  machine: bookmarksSystem,
};
```

### Key rules

- **Always handle `CLIENT_CONNECTED`** — this event fires when the frontend connects. Send initial state back to the plugin via the bus.
- **Use `emit()` to send to the frontend** — `system.get(bus).send(emit(systemId, event))` routes the event to the matching frontend plugin.
- **Never use `pluginId` as a field name in outgoing events** — the transport layer overwrites it. Use `targetId` or similar instead.

### Communication patterns

```typescript
// System -> Plugin (via bus)
system.get(bus).send(emit(bookmarks, { type: 'BOOKMARK_CREATED', bookmark }));

// System -> System (direct)
system.get(otherSystemId).send({ type: 'SOME_EVENT' });
```

The frontend sends events to systems via tRPC:

```typescript
// Plugin -> System (from frontend)
trpc.bus.send.mutate({ systemId: 'bookmarks', type: 'CREATE_BOOKMARK', url, title });
```

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
| `icon` | `Component` | yes | Lucide Vue component |
| `state` | `StateMachine` | yes | XState machine definition |
| `canvas` | `Component` | yes | Main content area component |
| `panel` | `Component` | no | Side panel component |

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
- All feature settings files are deep-merged at build time into a single settings object.

## Feature config

```typescript
// src/features/bookmarks/feature.config.ts
import type { FeatureConfig } from '@abuddy/sdk/build';

export default {
  name: 'bookmarks',
  designation: 'bookmarks',  // Optional — links to an EARS designation
  settings: './settings.ts',
} satisfies FeatureConfig;
```

## Manifest entry

The corresponding `abuddy.json` entry:

```json
{
  "id": "bookmarks",
  "settings": "src/features/bookmarks/settings.ts",
  "system": {
    "entry": "src/features/bookmarks/be/system.ts",
    "exportName": "bookmarksEntry"
  },
  "plugin": {
    "entry": "src/features/bookmarks/fe/plugin.ts",
    "label": "Bookmarks",
    "icon": "Bookmark"
  },
  "services": {}
}
```

A feature can omit `system` (frontend-only) or `plugin` (backend-only). The `services` map is always required, even if empty.
