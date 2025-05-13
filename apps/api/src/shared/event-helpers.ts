/* ============================================================================
 *  Type‑helper toolkit for the System‑Bus layer
 *  – Keeps Zod schemas, XState events, and runtime helpers in sync
 * ========================================================================== */

import { z, type ZodRawShape } from 'zod';
import type { OutgoingSystemEvents } from '@/shared/events';

/* --------------------------------------------------------------------------
 *  1.  Tiny utilities
 * ------------------------------------------------------------------------ */
/** Flatten intersections so tooltips stay readable. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Remove the `plugin` field when you only need the core event shape. */
type StripSystem<T> = T extends { plugin: string } ? Omit<T, 'plugin'> : T;

/* --------------------------------------------------------------------------
 *  2.  Transform Zod schema tuples ⇢ event unions
 * ------------------------------------------------------------------------ */
/** Extract a union of inferred objects from a readonly tuple of Zod schemas. */
export type EventsFromSchemas<
  S extends readonly z.ZodTypeAny[]
> = { [K in keyof S]: z.infer<S[K]> }[number];

/** Same as above but *without* the `plugin` property. */
export type EventsWithoutSystem<
  S extends readonly z.ZodTypeAny[]
> = Simplify<StripSystem<EventsFromSchemas<S>>>;

/** Merge incoming (external) events with internal machine events. */
export type MergeReceivable<
  TIncoming extends readonly z.ZodTypeAny[],
  TInternal
> = Simplify<EventsWithoutSystem<TIncoming> | TInternal>;

/* --------------------------------------------------------------------------
 *  3.  Helper: add a `plugin` literal to every union member
 * ------------------------------------------------------------------------ */
export type WithSystem<
  P extends string,
  E extends { type: string }
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
> = E extends any ? Simplify<E & { plugin: P }> : never;

/* --------------------------------------------------------------------------
 *  4.  Factory: build Zod schemas that carry a fixed `plugin` literal
 * ------------------------------------------------------------------------ */
/**
 * ```ts
 * const bus = systemBus('chat');
 * const UserMsg = bus('USER_MSG', { content: z.string() });
 * ```
 */
export function systemBus<P extends string>(plugin: P) {
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
 *     fromSystem(incomingSchemas)()<Outgoing, typeof plugin>
 * ------------------------------------------------------------------------ */
export function fromSystem<
  T extends readonly z.ZodTypeAny[]
>(incoming: T) {
  return <
    O extends { type: string },
    P extends string
  >() => ({
    incoming,
    outgoing: {} as WithSystem<P, O>,
  });
}

/* --------------------------------------------------------------------------
 *  7.  Combine any number of plugins into one definition object
 * ------------------------------------------------------------------------ */
export function mergeSystems<
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
