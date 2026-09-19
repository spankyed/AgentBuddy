import { sendParent, type AnyActorRef } from 'xstate';
import type { Simplify } from './type-helpers.ts';

type ExtractEvent<
  TEvent extends { type: string },
  TType extends TEvent['type'],
> = Extract<TEvent, { type: TType }>;

/**
 * Usage:
 * ```ts
 * const typeOf = safeEvents<MyUnion>();
 * const msg = typeOf(['A', 'B'], evt);   // evt is now narrowed
 * ```
 */
export function safeEvents<TEvent extends { type: string }>() {
  return function<
    TTypes extends
      | TEvent['type']
      | readonly TEvent['type'][]
  >(
    expected: TTypes,
    event: TEvent
  ): ExtractEvent<
    TEvent,
    TTypes extends readonly TEvent['type'][] ? TTypes[number] : TTypes
  > {
    const expectedArr: readonly TEvent['type'][] = Array.isArray(expected)
      ? expected
      : [expected];

    if (!expectedArr.includes(event.type as TEvent['type'])) {
      throw new Error(
        `Expected type ${expectedArr.join(' | ')}, got ${event.type}`
      );
    }
    return event as ExtractEvent<
      TEvent,
      TTypes extends readonly TEvent['type'][] ? TTypes[number] : TTypes
    >;
  };
}

export function sendParentSafe<TEvent extends { type: string }>() {
  return <Type extends TEvent['type']>(
    payload: Extract<TEvent, { type: Type }>
  ) => sendParent(payload);
}

/** An XState actor system (an action's `system`), by what these helpers need from it */
export interface ActorLookup {
  get(id: string): AnyActorRef | undefined;
}

export function getActor(system: ActorLookup, id: string): AnyActorRef {
  const actor = system.get(id);
  if (!actor) throw new Error(`Actor with id '${id}' not found in the system`);
  return actor;
}

export function getBus(system: ActorLookup): AnyActorRef {
  const busActor = system.get('bus');
  if (!busActor) throw new Error("Bus actor not found in the system");
  return busActor;
}

export type { Simplify };
