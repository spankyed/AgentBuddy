import { safeEvents } from '../helpers/actor-helpers.ts';
import type { Simplify } from '../helpers/type-helpers.ts';

/** Common system events sent by the bus to all systems. */
export type SystemEvents =
  | { type: 'CLIENT_CONNECTED' }
  /**
   * A pack was activated, reloaded or torn down while the app runs, or its seeds were imported: what it
   * registers (its slash commands) and the data it seeded may differ. Sent once the change is complete.
   */
  | { type: 'PACK_CHANGED'; packId: string }

/** Add `pluginId` literal to every member of an outgoing event union. */
// `E extends unknown` is the distribution idiom (`extends any` would do the same, but the published
// types carry no `any`: tests/build/published-sdk-any.spec.ts in @abuddy/cli)
type WithPlugin<Id extends string, E extends { type: string }> =
  E extends unknown ? Simplify<E & { pluginId: Id }> : never;

/** The definition object returned by `defineSystem()`. */
export interface SystemSpec<
  Id extends string,
  TEvents extends { type: string },
  TOutgoing extends { type: string },
  TContext = {},
> {
  id: Id;
  types: { context: TContext; events: TEvents | SystemEvents };
  typeOf: ReturnType<typeof safeEvents<TEvents | SystemEvents>>;
  /** Phantom: the events the system receives, as a sender writes them (the bus adds `systemId`). */
  _incoming: TEvents;
  /** Phantom — outgoing events with `pluginId` attached. */
  _outgoing: WithPlugin<Id, TOutgoing>;
}

/**
 * Define a backend system's identity and event types.
 *
 * ```ts
 * export const logsSpec = defineSystem('logs')<
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
  >(): SystemSpec<Id, TEvents, TOutgoing, TContext> => ({
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
