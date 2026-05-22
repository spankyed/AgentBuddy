import type { ActorSystem, ActorRefFromLogic } from 'xstate';
import type systems from '@/systems';
import type { Simplify } from '@/core/shared/type-helpers';
import { sendParent } from 'xstate';
import type { OutgoingSystemEvents } from '@/core/router/events';
import { bus } from '@/core/system-ids';
import type { backendSystem } from '@/systems';
import { createLogger } from '@/core/shared/debug/logger';

const logger = createLogger('actor-helpers');

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
export function safeEvents<TEvent extends { type: string }>() {
  return function<
    TTypes extends
      | TEvent['type']                                   // single literal
      | readonly TEvent['type'][]                        // tuple / array
  >(
    expected: TTypes,
    event: TEvent
  ): ExtractEvent<
    TEvent,
    TTypes extends readonly TEvent['type'][] ? TTypes[number] : TTypes
  > {
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
}

type SystemStates = typeof systems;
export type SystemId = keyof SystemStates;

export function getActor<Id extends SystemId>(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  system: ActorSystem<any>,
  id: Id,
) {
  type ActorRef = ActorRefFromLogic<SystemStates[Id]>;
  // type ActorEvents = EventFromLogic<SystemStates[Id]>;
  
  const actor = system.get(id);
  if (!actor) {
    throw new Error(`Actor with id '${id}' not found in the system`);
  }
  return actor as ActorRef;
}

export function emit<
  T extends OutgoingSystemEvents['type'],
  E extends Extract<OutgoingSystemEvents, { type: T }>
>(
  pluginId: E['pluginId'] | 'application',
  // Explicitly require all properties except pluginId
  event: Omit<E, 'pluginId'> & { type: T }
) {
  // Type-safe emit function that ensures all required properties for a given event type are provided
  const fullEvent = { ...event, pluginId } as E;
  return {
    type: 'OUTGOING' as const,
    event: fullEvent,
  };
}

export function getBus(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  system: ActorSystem<any>,
) {
  type ActorRef = ActorRefFromLogic<typeof backendSystem>;
  const busActor = system.get(bus);
  if (!busActor) {
    throw new Error("Bus actor not found in the system");
  }
  return busActor as ActorRef;
}

export function logErrors(actor: string) {
  return {
    error: (error: unknown) => {
      logger.error(`${actor} State Error:`, { error });
      // Write structured JSON for the main process to parse (JSON lines pattern)
      const err = error instanceof Error ? error : new Error(String(error));
      process.stderr.write(JSON.stringify({
        __fatal: true,
        message: err.message,
        stack: err.stack,
        source: actor,
      }) + '\n');
    }
  }
}
