import type { AnyActorRef } from 'xstate';
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

/** An XState actor system (an action's `system`), by what these helpers need from it */
export interface ActorLookup {
  get(id: string): AnyActorRef | undefined;
}

export function getActor(system: ActorLookup, id: string): AnyActorRef {
  const actor = system.get(id);
  if (!actor) throw new Error(`Actor with id '${id}' not found in the system`);
  return actor;
}

export type { Simplify };
