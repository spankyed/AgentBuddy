# CLAUDE.md - Frontend Plugins

This file provides guidance to Claude Code when working with the frontend plugin architecture.

## Overview

The frontend uses a plugin-based architecture where each plugin is an XState actor that manages its own state and UI. Plugins communicate with backend systems via WebSocket events and display content in designated UI areas.

## Plugin Structure

Every plugin follows this structure:

```typescript
// plugin.ts
export const pluginId = 'pluginName' as const;

export default {
  id: pluginId,
  label: 'Plugin Display Name',
  icon: SomeIcon,              // Lucide Vue icon
  state: pluginStateMachine,   // XState machine
  canvas: CanvasComponent,     // Main content area (required)
  panel: PanelComponent,       // Side panel (optional)
  isPinned: true,              // Show in toolbar
} satisfies Plugin;
```

## State Machine Integration

### Basic State Machine Structure
```typescript
// state.ts
export type Context = {
  data: SomeData[];
  selectedItem: SomeData | null;
  isLoading: boolean;
};

export type Event = 
  | { type: 'ITEM_SELECTED'; item: SomeData }
  | { type: 'BACKEND_DATA'; data: SomeData[] }
  | PluginEvent; // Common plugin events

const pluginState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    assignData: assign({
      data: ({ event }) => event.data
    })
  }
}).createMachine({
  id: 'pluginName',
  initial: 'canvas',
  context: {
    data: [],
    selectedItem: null,
    isLoading: false
  },
  states: {
    canvas: {
      meta: breadcrumb('canvas', 'Main View', true),
      on: {
        ITEM_SELECTED: {
          target: 'detail',
          actions: assign({
            selectedItem: ({ event }) => event.item
          })
        }
      }
    },
    detail: {
      meta: breadcrumbWithParams<Context>({
        target: 'detail',
        getLabel: (ctx) => ctx.selectedItem?.name || 'Detail'
      }),
      on: {
        BACK: 'canvas'
      }
    }
  },
  on: {
    PLUGIN_ACTIVATED: {
      actions: 'loadInitialData'
    },
    BACKEND_DATA: {
      actions: 'assignData'
    }
  }
});
```

### Vue Component Integration
```vue
<template>
  <div v-if="isLoading" class="loading">Loading...</div>
  <div v-else>
    <div v-for="item in data" :key="item.id" @click="selectItem(item)">
      {{ item.name }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue';
import { applicationState } from '@/main';

const pluginId = 'pluginName';
const actor = applicationState.system.get(pluginId);

// Reactive state selectors
const data = useSelector(actor, (state) => state.context.data);
const isLoading = useSelector(actor, (state) => state.context.isLoading);

// Event handlers
const selectItem = (item) => {
  actor.send({ type: 'ITEM_SELECTED', item });
};
</script>
```

## UI Areas

### Canvas (Required)
The main content area that changes based on the active plugin.

```typescript
// Single component
canvas: MyCanvasComponent

// Route-based components
canvas: {
  main: MainView,
  detail: DetailView,
  create: CreateView
}
```

### Panel (Optional)
Side panel for contextual information or secondary actions.

```vue
<!-- panel.vue -->
<template>
  <div class="panel">
    <h3>Context Info</h3>
    <div v-if="selectedItem">
      <p>{{ selectedItem.description }}</p>
    </div>
  </div>
</template>
```

## Backend Communication

### Sending Events to Backend
```typescript
import { trpc } from '@/core/trpc';

// In Vue component or state machine action
const sendToBackend = async (data) => {
  await trpc.bus.send.mutate({
    systemId: pluginId,
    type: 'PROCESS_DATA',
    data
  });
};

// In state machine actions
actions: {
  requestData: () => {
    trpc.bus.send.mutate({
      systemId: pluginId,
      type: 'GET_DATA'
    });
  }
}
```

### Handling Backend Events
```typescript
// State machine handles backend events like any other event (just ensure the types are passed through schema layer to FE plugin to ensure no type errors)
on: {
  DATA_RECEIVED: {
    actions: assign({
      data: ({ event }) => event.data
    })
  },
  ERROR_OCCURRED: {
    actions: 'handleError'
  }
}
```

## Breadcrumb Navigation

### Basic Breadcrumbs
```typescript
states: {
  list: {
    meta: breadcrumb('list', 'Items', true), // target, label, isDefault
  },
  detail: {
    meta: breadcrumb('detail', 'Item Detail'),
  }
}
```

### Dynamic Breadcrumbs
```typescript
states: {
  itemView: {
    meta: breadcrumbWithParams<Context>({
      target: 'view',
      getLabel: (ctx) => ctx.selectedItem?.name || 'Item'
    })
  }
}
```

### Breadcrumb Click Handling
```typescript
on: {
  ...TRAIL_CLICK([
    ['.list', 'list'],      // CSS selector → state
    ['.detail', 'detail'],
  ]),
}
```

## Plugin Registry

Current active plugins:

- **agent**: Main AI conversation interface with canvas, and panel
- **flows**: Visual flow editor with node-based workflow creation
- **database**: EARS database viewer and query interface
- **brain**: Dialog flow execution monitoring and debugging
- **threads**: Thread/conversation management system
- **prompts**: Prompt template creation and management
- **logs**: System log viewer for debugging

## Creating a New Plugin

### 1. Copy Template
```bash
# Copy the blank template
cp -r _blank/ my-new-plugin/
cd my-new-plugin/
```

### 2. Define Plugin Structure
```typescript
// plugin.ts
export const myPluginId = 'myPlugin' as const;

export default {
  id: myPluginId,
  label: 'My Plugin',
  icon: MyIcon,
  state: myPluginState,
  canvas: MyCanvas,
  // panel: MyPanel, // optional, rarely used
} satisfies Plugin;
```

### 3. Implement State Machine
```typescript
// state.ts
export const myPluginState = setup({
  // Define types, actions, guards
}).createMachine({
  // Define states and transitions
});
```

### 4. Create Vue Components
```vue
<!-- canvas.vue -->
<template>
  <div class="my-plugin-canvas">
    <!-- Plugin main content -->
  </div>
</template>
```

### 5. Register Plugin
```typescript
// index.ts
import myPlugin from './my-plugin/plugin';

export default [
  // ... other plugins
  myPlugin,
];
```

## Development Patterns

### Type-Safe Event Handling
```typescript
const typeOf = safeEvents<Event>();

actions: {
  handleEvent: ({ event }) => {
    const typedEvent = typeOf('SPECIFIC_EVENT', event);
    // typedEvent is now properly typed
  }
}
```

### State Selectors
```typescript
const actor = applicationState.system.get(pluginId);
const pluginData = useSelector(actor, (state) => state.context.data);
```

### Component Composition
```typescript
// Large plugins should break down into smaller components
components/
├── my-plugin-list.vue
├── my-plugin-item.vue
├── my-plugin-detail.vue
└── forms/
    ├── create-form.vue
    └── edit-form.vue
```

## Common Patterns

1. **Always handle PLUGIN_ACTIVATED** - Load initial data when plugin becomes active
2. **Use breadcrumbs for navigation trail** - Provides consistent navigation trail UX
3. **Type events properly** - Use safeEvents() for type safety
4. **Separate concerns** - Keep business logic in state machines, UI logic in components
5. **Handle loading / empty states** - Show appropriate loading and empty data indicators
6. **Components should emit events** - Child components should be dumb and only emit events up to some root component which should in turn send them to the plugin state machine

## Debugging

### Event Logging
```typescript
actions: {
  logEvent: ({ event }) => {
    console.log('Plugin event:', event);
  }
}
```

## Performance Considerations

- Use selective selectors to prevent unnecessary re-renders
- Ensure proper cleanup of subscriptions and actors when plugins deactivate
- Implement pagination for large datasets and lists