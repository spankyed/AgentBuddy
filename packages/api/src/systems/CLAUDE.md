# CLAUDE.md - Backend Systems

This file provides guidance to Claude Code when working with the backend systems architecture.

## Overview

The backend uses an event-driven, actor-based architecture built on XState state machines. Each system is an independent actor that communicates through typed events via a central bus.

## System Structure

Every system follows this pattern:

```typescript
import { setup } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { emit } from '@/core/helpers/actor-helpers';

// 1. Event types (plain TypeScript discriminated unions)
type IncomingEvents =
  | { type: 'DO_SOMETHING'; param: string }
  | { type: 'DO_OTHER'; id: string };

type InternalEvents =
  | { type: 'SETTINGS_UPDATED'; settings: any };

export type OutgoingEvents =
  | { type: 'DATA_CONNECTED'; data: any };

interface MyContext { /* ... */ }

// 2. System definition (merges incoming + internal as first generic, context as third)
export const myDef = defineSystem('mySystem')<
  IncomingEvents | InternalEvents,
  OutgoingEvents,
  MyContext
>();
export const mySystem = myDef.id;

// 3. State machine (types auto-provided by def.types)
export const myMachine = setup({
  types: myDef.types,
  actions: { /* ... */ },
}).createMachine({
  id: myDef.id,
  /* ... */
});
```

### `defineSystem()` generics

```typescript
defineSystem('id')<TEvents, TOutgoing, TContext?>()
```

- **1st**: All receivable events (incoming + internal merged with `|`)
- **2nd**: Outgoing events (sent to frontend)
- **3rd**: Context type (optional, defaults to `{}`)

### What `defineSystem()` returns

| Property | Purpose |
|----------|---------|
| `id`     | Literal string system identifier |
| `types`  | `{ context, events }` — pass directly to `setup({ types: def.types })` |
| `typeOf` | Pre-typed `safeEvents()` for narrowing events in actions |
| `_incoming` | Phantom type for global event assembly (don't use directly) |
| `_outgoing` | Phantom type for global event assembly (don't use directly) |

## Event Communication Patterns

### Sending Events to a Frontend state machine (aka plugin)
```typescript
actions: {
  sendData: ({ system }) => {
    system.get(bus).send(emit(pluginName, {
      type: 'DATA_EVENT',
      data: getData()
    }));
  }
}
```

### Communicating with Other Systems
```typescript
actions: {
  callOtherSystem: ({ system }) => {
    const otherActor = system.get(otherSystemName);
    otherActor.send({ type: 'SOME_EVENT' });
  }
}
```

### Type-safe event narrowing
```typescript
actions: {
  createThread: ({ system, event }) => {
    const thread = myDef.typeOf('CREATE_THREAD', event);
    // thread is narrowed to { type: 'CREATE_THREAD'; ... }
  },
}
```

## Repository Pattern

Each system's repository handles data operations:

- `startup.ts` - Initial data sent when CLIENT_CONNECTED
- `read.ts` - Query operations
- `create.ts` - Entity creation
- `update.ts` - Entity updates
- `mock-data.ts` - Development data

Use EARS helpers to interact with long-lived BE data:
- `qx()` - Query execution, used for querying and reading data (NOT ASYNC DO NOT await)
- `tx()` - Transaction execution, used for creation and mutation (NOT ASYNC DO NOT await)

## Common State Machine Patterns

### Basic State Structure
```typescript
states: {
  idle: {
    on: {
      CLIENT_CONNECTED: {
        actions: 'sendStartupData',
      },
    }
  },
  running: {
    //  ...
  }
}
```

### Spawning Child Actors
```typescript
actions: {
  spawnActors: enqueueActions(({ enqueue }) => {
    for (const [id, state] of entries(systems)) {
      enqueue.spawnChild(state, { systemId: id as SystemId });
    }
  }),
}
```

## System Registry

Current systems and their responsibilities:

- **agent**: Display messages and other AI content, presentation only
- **brain**: Executes dialog flows and steps, if flows are the blueprint - the brain is the implementation
- **threads**: Ticketing system that's doubles as a way to organize conversations
- **flows**: Handles flow definitions and node configurations, bread and butter of the application
- **prompts**: Manages the prompt templates used by "LLM" flow nodes
- **database**: Database viewer used for debugging purposes, executes raw EARS queries from the FE
- **logs**: Centralized logging infrastructure with a web interface for debugging
- **_backend**: The bus system creates the root actor system, spawning all other systems and coordinating internal communication

## Adding a New System

1. Create directory: `packages/api/src/systems/[system-name]/`
2. Create required files:
   - `system.ts` - State machine definition
   - `types.ts` - Event and type definitions
   - `repository/` - Data access functions
3. Register in `packages/api/src/systems/index.ts`:
   ```typescript
    import { newDef, newMachine } from '@/systems/new/system';
    const newId = newDef.id;

    // Add to default export
    export default {
      // ...
      [newId]: newMachine,
    } as const;

    // Add to allDefs array for phantom type assembly
    const allDefs = [..., newDef] as const;
   ```

## Important Patterns

1. **Handle CLIENT_CONNECTED** - Always send some initial data to a corresponding frontend plugin
2. **Define events as plain TS types** - No Zod; use discriminated unions
3. **Use `defineSystem()` for system identity and types** - Provides `types`, `typeOf`, and phantom types
4. **Use emit() helper to send messages back to the FE** - Ensures proper event structure
5. **Use system.get() to access other BE systems** - Use system.get() to access other systems
6. **Use def.typeOf() to narrow events in actions** - Call directly on the def object
7. **Use createLogger() to log events** - Use createLogger() to log events

## Debugging

- Run `npm run build` to build the backend
- Run `npm run typecheck:be` to run type check for the backend


## Performance Considerations
- all data is stored in memory
