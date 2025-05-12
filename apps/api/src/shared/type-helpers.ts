/* ============================================================================
 *  Type‑helper toolkit for the Plugin‑Bus layer
 *  – Keeps Zod schemas, XState events, and runtime helpers in sync
 * ========================================================================== */

import { z, type ZodRawShape } from 'zod';
import { sendParent } from 'xstate';
import type { OutgoingPluginEvents } from './events';

/* --------------------------------------------------------------------------
 *  1.  Tiny utilities
 * ------------------------------------------------------------------------ */
/** Flatten intersections so tooltips stay readable. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Remove the `plugin` field when you only need the core event shape. */
type StripPlugin<T> = T extends { plugin: string } ? Omit<T, 'plugin'> : T;

/* --------------------------------------------------------------------------
 *  2.  Transform Zod schema tuples ⇢ event unions
 * ------------------------------------------------------------------------ */
/** Extract a union of inferred objects from a readonly tuple of Zod schemas. */
export type EventsFromSchemas<
  S extends readonly z.ZodTypeAny[]
> = { [K in keyof S]: z.infer<S[K]> }[number];

/** Same as above but *without* the `plugin` property. */
export type EventsWithoutPlugin<
  S extends readonly z.ZodTypeAny[]
> = Simplify<StripPlugin<EventsFromSchemas<S>>>;

/** Merge incoming (external) events with internal machine events. */
export type MergeReceivable<
  TIncoming extends readonly z.ZodTypeAny[],
  TInternal
> = Simplify<EventsWithoutPlugin<TIncoming> | TInternal>;

/* --------------------------------------------------------------------------
 *  3.  Helper: add a `plugin` literal to every union member
 * ------------------------------------------------------------------------ */
export type WithPlugin<
  P extends string,
  E extends { type: string }
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
> = E extends any ? Simplify<E & { plugin: P }> : never;

/* --------------------------------------------------------------------------
 *  4.  Factory: build Zod schemas that carry a fixed `plugin` literal
 * ------------------------------------------------------------------------ */
/**
 * ```ts
 * const bus = pluginBus('chat');
 * const UserMsg = bus('USER_MSG', { content: z.string() });
 * ```
 */
export function pluginBus<P extends string>(plugin: P) {
  return <
    T extends string,
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    S extends ZodRawShape = {}
  >(
    type: T,
    shape?: S,
  ) =>
    z.object({
      type: z.literal(type),
      ...(shape ?? {}),
      plugin: z.literal(plugin),
    }) as z.ZodObject<
      Simplify<{ type: z.ZodLiteral<T>; plugin: z.ZodLiteral<P> } & S>
    >;
}

/* --------------------------------------------------------------------------
 *  5.  Helper: package one plugin’s events
 *     fromPlugin(incomingSchemas)()<Outgoing, typeof plugin>
 * ------------------------------------------------------------------------ */
export function fromPlugin<
  T extends readonly z.ZodTypeAny[]
>(incoming: T) {
  return <
    O extends { type: string },
    P extends string
  >() => ({
    incoming,
    outgoing: {} as WithPlugin<P, O>,
  });
}

/* --------------------------------------------------------------------------
 *  6.  Runtime helper: build an OUTGOING envelope
 * ------------------------------------------------------------------------ */
export function emit<
  P extends string,
  E extends Simplify<Omit<OutgoingPluginEvents, 'plugin'>>
>(
  plugin: P,
  event: E,
) {
  return {
    type: 'OUTGOING' as const,
    event: { ...event, plugin } as Simplify<E & { plugin: P }>,
  };
}

/* --------------------------------------------------------------------------
 *  7.  Combine any number of plugins into one definition object
 * ------------------------------------------------------------------------ */
export function mergePlugins<
  const P extends readonly {
    incoming: readonly z.ZodTypeAny[];
    outgoing: unknown;
  }[],
>(...plugins: P) {
  // 7‑a. Runtime: concatenate incoming schema tuples
  const incoming = plugins.flatMap(p => p.incoming) as unknown as
    { [K in keyof P]: P[K]['incoming'] }[number];

  // 7‑b. Types: union of all plugins’ outgoing events
  type Outgoing = { [K in keyof P]: P[K]['outgoing'] }[number];

  return {
    incoming,
    outgoing: {} as Outgoing,
  } as const;
}

/* --------------------------------------------------------------------------
 *  8.  XState helpers
 * ------------------------------------------------------------------------ */
/** Wrap `sendParent` so event names & payloads are type‑safe. */
export function sendParentSafe<TEvent extends { type: string }>() {
  return <
    Type extends TEvent['type']
  >(
    type: Type,
    payload?: Simplify<Omit<Extract<TEvent, { type: Type }>, 'type'>>
  ) => sendParent({ type, ...(payload || {}) });
}

/* --------------------------------------------------------------------------
 *  9.  Event‑narrowing helpers
 * ------------------------------------------------------------------------ */
export type ExtractEvent<
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