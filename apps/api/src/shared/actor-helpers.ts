import type { ActorSystem, ActorRefFromLogic, EventFromLogic, AnyActorRef } from 'xstate';
import type actorStates from '@/actors';
import type { Simplify } from './type-helpers';
import { sendParent } from 'xstate';

type ExtractEvent<
  TEvent extends { type: string },
  TType extends TEvent['type'],
> = Extract<TEvent, { type: TType }>;

/** Wrap `sendParent` so event names & payloads are type‑safe. */
export function sendParentSafe<TEvent extends { type: string }>() {
  return <
    Type extends TEvent['type']
  >(
    payload: Simplify<Extract<TEvent, { type: Type }>>
  ) => sendParent(payload);
}

/**
 * Usage:
 * ```ts
 * const typeOf = safeEvents<MyUnion>();
 * const msg = typeOf(['A', 'B'], evt);   // evt is now narrowed
 * ```
 */
export const safeEvents =
  <TEvent extends { type: string }>() =>
  <
    TTypes extends
      | TEvent['type']                                   // single literal
      | readonly TEvent['type'][]                        // tuple / array
  >(
    expected: TTypes,
    event: TEvent
  ): ExtractEvent<
    TEvent,
    TTypes extends readonly TEvent['type'][] ? TTypes[number] : TTypes
  > => {
    // normalise to array for the runtime check
    const expectedArr: readonly TEvent['type'][] = Array.isArray(expected)
      ? expected
      : [expected];

    if (!expectedArr.includes(event.type as TEvent['type'])) {
      throw new Error(
        `Expected type ${expectedArr.join(' | ')}, got ${event.type}`
      );
    }
    // TypeScript knows it's one of the expected types here
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    return event as any;
  };

type ActorStates = typeof actorStates;
type ActorIds = keyof ActorStates;

export function getActor<Id extends ActorIds>(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  system: ActorSystem<any>,
  id: Id,
) {
  type ActorRef = ActorRefFromLogic<ActorStates[Id]>;
  // type ActorEvents = EventFromLogic<ActorStates[Id]>;
  
  return system.get(id) as ActorRef;
}
