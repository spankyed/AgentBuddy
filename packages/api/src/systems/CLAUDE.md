# CLAUDE.md - Backend Systems

This file provides guidance to Claude Code when working with the backend systems architecture.

## Overview

The backend uses an event-driven, actor-based architecture built on XState state machines. Each system is an independent actor that communicates through typed events via a central bus.

## System Structure

Every system follows this pattern:

```typescript
// 1. System identifier
export const newId = 'new' as const;

// 2. Incoming events (validated with Zod)
export const IncomingSystemEvents = [
  systemBus('INCOMING_EVENT_NAME', { param: z.string() }),
] as const;

// 3. Internal events (not exposed through api bus)
export type SystemInternalEvents = 
  | { type: 'INTERNAL_EVENT' }

// 4. Outgoing events (sent to frontend)
export type OutgoingSystemEvents =
  | { type: 'OUTGOING_EVENT_NAME'; data: any };

// 5. Type inference for event actions
type ReceivableEvents = MergeReceivable<typeof IncomingSystemEvents, SystemInternalEvents>;

// 6. BE event bus registration helper
export const NewSystemEvents = fromSystem(IncomingSystemEvents)<OutgoingSystemEvents, typeof newId>()

// 7. State machine
export const newSystem = setup({
  types: {
    events: {} as ReceivableEvents,
  },
  actors: { /* ... */ },
  actions: { /* ... */ }
}).createMachine({ /* ... */ });
```

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

1. Create directory: `/apps/api/src/systems/[system-name]/`
2. Create required files:
   - `system.ts` - State machine definition
   - `types.ts` - Event and type definitions
   - `repository/` - Data access functions
3. Register in `/apps/api/src/systems/index.ts`:
   ```typescript
    import { newId, newSystem, NewSystemEvents } from '@/systems/new/system';

    // Add to default export
    export default {
      // ...
      [newId]: newSystem,
    } as const;

    // Add to events export for api bus registration
    export const events = mergeSystems(
      // ...
      NewSystemEvents,
    );
   ```

## Development Tips

### Event Definition
```typescript
// Use systemBus() for incoming events
export const IncomingSystemEvents = [
  systemBus('DO_SOMETHING', {
    param1: z.string(),
    param2: z.number().optional()
  })
] as const;
```

### Expose ID for other systems to reference
```typescript
export const otherSystemName = 'otherSystemName' as const;

// in separate file
import { otherSystemName } from '@/systems/other/system';
const otherActor = system.get(otherSystemName);
```

### Type inference for event actions
```typescript
const typeOf = safeEvents<ReceivableEvents>();

actions: {
  createThread: ({ system, event }) => {
    const thread = typeOf('CREATE_THREAD', event);

    // ...
  },
}
```

## Important Patterns

1. **Handle CLIENT_CONNECTED** - Always send some initial data to a corresponding frontend plugin
2. **Define events from FE (api) in IncomingSystemEvents** - Use systemBus() for incoming events
3. **Use zod for validation** - Use zod for validation
4. **Use emit() helper to send messages back to the FE (api)** - Ensures proper event structure
5. **Use system.get() to access other BE systems** - Use system.get() to access other systems
6. **Use safeEvents() to type events** - Use safeEvents() to type events
7. **Use createLogger() to log events** - Use createLogger() to log events

## Debugging

- Run `npm run build` to build the backend
- Run `npm run dev:types` to run type check for the backend


## Performance Considerations
- all data is stored in memory
