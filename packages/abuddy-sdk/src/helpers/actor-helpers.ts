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
 * Generic emit — wraps an event with pluginId for the bus.
 * Each system uses this with its own outgoing type for per-system type safety.
 * The global OutgoingSystemEvents union is assembled in api/src/systems/index.ts.
 */
export function emit<E extends { type: string }>(
  pluginId: string,
  event: E
) {
  return {
    type: 'OUTGOING' as const,
    event: { ...event, pluginId },
  };
}

export type { Simplify };
