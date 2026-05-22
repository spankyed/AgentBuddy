import { safeEvents } from '@/core/shared/actor-helpers';
import type { SystemEvents } from '@/systems/backend';
import type { Simplify } from '@/core/shared/type-helpers';

/** Add `systemId` literal to every member of an incoming event union. */
type WithSystemId<Id extends string, E extends { type: string }> =
  E extends any ? Simplify<E & { systemId: Id }> : never;

/** Add `pluginId` literal to every member of an outgoing event union. */
type WithPlugin<Id extends string, E extends { type: string }> =
  E extends any ? Simplify<E & { pluginId: Id }> : never;

/** The definition object returned by `defineSystem()`. */
export interface SystemDefinition<
  Id extends string,
  TEvents extends { type: string },
  TOutgoing extends { type: string },
  TContext = {},
> {
  id: Id;
  types: { context: TContext; events: TEvents | SystemEvents };
  typeOf: ReturnType<typeof safeEvents<TEvents | SystemEvents>>;
  /** Phantom — incoming events with `systemId` attached (wire format). */
  _incoming: WithSystemId<Id, TEvents>;
  /** Phantom — outgoing events with `pluginId` attached. */
  _outgoing: WithPlugin<Id, TOutgoing>;
}

/**
 * Define a backend system's identity and event types.
 *
 * ```ts
 * export const logsDef = defineSystem('logs')<
 *   IncomingLogEvents | LogsInternalEvents,
 *   OutgoingLogsEvents,
 *   LogsContext
 * >();
 * ```
 */
export function defineSystem<Id extends string>(id: Id) {
  return <
    TEvents extends { type: string },
    TOutgoing extends { type: string },
    TContext = {},
  >(): SystemDefinition<Id, TEvents, TOutgoing, TContext> => ({
    id,
    types: {
      context: {} as TContext,
      events: {} as TEvents | SystemEvents,
    },
    typeOf: safeEvents<TEvents | SystemEvents>(),
    _incoming: undefined as any,
    _outgoing: undefined as any,
  });
}
