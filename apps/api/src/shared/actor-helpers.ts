import type { ActorSystem, ActorRefFromLogic, EventFromLogic, AnyActorRef } from 'xstate';
import type systemStates from '@/systems';
import type { Simplify } from './event-helpers';
import { sendParent } from 'xstate';
import type { OutgoingSystemEvents } from './events';
import { bus, type backendSystem } from '@/systems';

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

type SystemStates = typeof systemStates;
export type SystemIds = keyof SystemStates;

export function getActor<Id extends SystemIds>(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  system: ActorSystem<any>,
  id: Id,
) {
  type ActorRef = ActorRefFromLogic<SystemStates[Id]>;
  // type ActorEvents = EventFromLogic<SystemStates[Id]>;
  
  return system.get(id) as ActorRef;
}

export function emit<
  P extends string,
  E extends Simplify<Omit<OutgoingSystemEvents, 'systemId'>>
>(
  systemId: P,
  event: E,
) {
  return {
    type: 'OUTGOING' as const,
    event: { ...event, systemId } as Simplify<E & { systemId: P }>,
  };
}

export function getBus(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  system: ActorSystem<any>,
) {
  type ActorRef = ActorRefFromLogic<typeof backendSystem>;
  return system.get(bus) as ActorRef;
}

export function logErrors(actor: string) {
  return {
    error: (error: unknown) => {
      console.error(`${actor} State Error:`, error);
    }
  }
}
