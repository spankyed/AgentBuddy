# Backend Systems

Event-driven actor architecture built on XState. Each system is an independent actor communicating through typed events via a central bus.

## System Pattern

```typescript
import { setup } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { emit } from '@/core/shared/actor-helpers';

type IncomingEvents =
  | { type: 'DO_SOMETHING'; param: string };

type InternalEvents =
  | { type: 'SETTINGS_UPDATED'; settings: any };

export type OutgoingEvents =
  | { type: 'DATA_CONNECTED'; data: any };

// defineSystem('id')<TEvents, TOutgoing, TContext?>()
export const myDef = defineSystem('mySystem')<IncomingEvents | InternalEvents, OutgoingEvents, MyContext>();
export const mySystem = myDef.id;

export const myMachine = setup({
  types: myDef.types,       // { context, events } auto-constructed
  actions: {
    sendData: ({ system }) => {
      system.get(bus).send(emit(mySystem, { type: 'DATA_CONNECTED', data: getData() }));
    },
    handleEvent: ({ event }) => {
      const ev = myDef.typeOf('DO_SOMETHING', event); // narrows event type
    },
  },
}).createMachine({ id: myDef.id, /* ... */ });
```

## Key Rules

- Handle `CLIENT_CONNECTED` — send initial data to the corresponding frontend plugin
- Events are plain TS discriminated unions (no Zod)
- `qx()` / `tx()` for data queries/mutations — synchronous, do NOT await
- `system.get(otherSystemId)` to communicate between systems
- Register new systems in `packages/api/src/systems/index.ts` (add to default export + `allDefs` array)

## Event bus pitfalls

- **`sendToPlugin` wraps events with a `pluginId` field** for routing. If your event payload also has a field named `pluginId`, the wrapper **overwrites** it. Use a different field name (e.g. `targetId`) for any inner plugin reference.
- **`sendToPlugin('application', ...)`** is an escape hatch to reach the root application actor (not a registered plugin). It works because the frontend `backendListener` special-cases `pluginId === 'application'`. Never put a `pluginId` field inside events sent this way — it will be stripped during destructuring.
