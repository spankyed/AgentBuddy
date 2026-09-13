import type { Simplify } from './type-helpers';

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
    return event as any;
  };
}

/**
 * Plugin id → the events that plugin receives. Each pack's `#generated/events` defines its
 * `PackEvents` and exports `emit` / `sendToPlugin` typed against it.
 */
export type PluginEvents = { [pluginId: string]: { type: string } };

/** `emit` typed against a plugin event map (see `#generated/events`). */
export type TypedEmit<M extends PluginEvents> = <P extends keyof M & string>(
  pluginId: P,
  event: M[P],
) => { type: 'OUTGOING'; event: M[P] & { pluginId: P } };

/**
 * Wraps an event with pluginId for the bus. Untyped: packs use the `emit` from their
 * `#generated/events`, which constrains the event to what the plugin receives.
 * The global OutgoingSystemEvents union is assembled in api/src/systems/index.ts.
 */
export function emit<P extends string, E extends { type: string }>(
  pluginId: P,
  event: E
): { type: 'OUTGOING'; event: E & { pluginId: P } };

export function emit(pluginId: string, event: { type: string }) {
  return {
    type: 'OUTGOING' as const,
    event: { ...event, pluginId },
  };
}

export function sendParentSafe<TEvent extends { type: string }>() {
  return <Type extends TEvent['type']>(
    payload: Extract<TEvent, { type: Type }>
  ) => {
    const { sendParent } = require('xstate');
    return sendParent(payload);
  };
}

export function getActor(system: any, id: string) {
  const actor = system.get(id);
  if (!actor) throw new Error(`Actor with id '${id}' not found in the system`);
  return actor;
}

export function getBus(system: any) {
  const busActor = system.get('bus');
  if (!busActor) throw new Error("Bus actor not found in the system");
  return busActor;
}

export type { Simplify };
