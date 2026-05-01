import { safeEvents } from '@/core/helpers/actor-helpers';
import type { SystemEvents } from '@/systems/backend';
import type { Simplify } from '@/core/helpers/type-helpers';

/** Add `systemId` literal to every member of an incoming event union. */
type WithSystemId<Id extends string, E extends { type: string }> =
  E extends any ? Simplify<E & { systemId: Id }> : never;

/** Add `pluginId` literal to every member of an outgoing event union. */
type WithPlugin<Id extends string, E extends { type: string }> =
  E extends any ? Simplify<E & { pluginId: Id }> : never;

/** The definition object returned by `defineSystem()`. */
export interface SystemDefinition<
  Id extends string,
  TIncoming extends { type: string },
  TOutgoing extends { type: string },
  TInternal extends { type: string } = never,
> {
  id: Id;
  typeOf: ReturnType<typeof safeEvents<TIncoming | TInternal | SystemEvents>>;
  /** Phantom — incoming events with `systemId` attached (wire format). */
  _incoming: WithSystemId<Id, TIncoming>;
  /** Phantom — outgoing events with `pluginId` attached. */
  _outgoing: WithPlugin<Id, TOutgoing>;
}

/**
 * Define a backend system's identity and event types.
 *
 * ```ts
 * export const promptsDef = defineSystem('prompts')<
 *   IncomingPromptEvents,
 *   OutgoingPromptEvents,
 *   PromptsInternalEvents
 * >();
 * ```
 */
export function defineSystem<Id extends string>(id: Id) {
  return <
    TIncoming extends { type: string },
    TOutgoing extends { type: string },
    TInternal extends { type: string } = never,
  >(): SystemDefinition<Id, TIncoming, TOutgoing, TInternal> => ({
    id,
    typeOf: safeEvents<TIncoming | TInternal | SystemEvents>(),
    _incoming: undefined as any,
    _outgoing: undefined as any,
  });
}

/** Extract the full receivable event union from a SystemDefinition. */
export type Receivable<D> =
  D extends SystemDefinition<any, infer I, any, infer Int>
    ? I | Int | SystemEvents
    : never;
