import { sendParent } from 'xstate';
import { z, type ZodRawShape } from 'zod';
import type { OutgoingPluginEvents } from './events';

/* ———————————————————————————————————————————————— *
 *  Utilities to keep IDE tooltips tidy
 * ———————————————————————————————————————————————— */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};
type StripPlugin<T> = T extends { plugin: string } ? Omit<T, 'plugin'> : T;

/* ──  Helper to merge plugin events with internal events ─────── */
export type MergeReceivable<TIncoming extends readonly z.ZodTypeAny[], TInternal> = Simplify<EventsWithoutPlugin<TIncoming> | TInternal>;

// From a readonly array of Zod schemas → union of inferred objects
export type EventsFromSchemas<
  S extends readonly z.ZodTypeAny[]
  > = { [K in keyof S]: z.infer<S[K]> }[number];

export type EventsWithoutPlugin<
  S extends readonly z.ZodTypeAny[]
  > = Simplify<StripPlugin<EventsFromSchemas<S>>>;

/* ──  Generic helper: add a plugin literal to each union member ─────── */
export type WithPlugin<
  P extends string,              // the plugin literal
  E extends { type: string },    // the original union (must have `type`)
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
> = E extends any ? Simplify<E & { plugin: P }> : never;

/* ———————————————————————————————————————————————— *
 *   Factory that bakes a fixed `plugin` literal in
 *    const chatBus = pluginBus('chat')
 *    chatBus('USER_MSG', { content: z.string() })
 *      → z.object({
 *          type:    z.literal('USER_MSG'),
 *          content: z.string(),
 *          plugin:  z.literal('chat')
 *        })
 * ———————————————————————————————————————————————— */
export function pluginBus<P extends string>(plugin: P) {
  return <
    T extends string,
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    S extends ZodRawShape = {}          // ← default = empty object
  >(
    type: T,
    shape?: S                          // ← now optional
  ) =>
    z.object({
      type:   z.literal(type),
      ...(shape ?? {}),                // ← safe when `shape` is undefined
      plugin: z.literal(plugin),
    }) as z.ZodObject<
      Simplify<{ type: z.ZodLiteral<T>; plugin: z.ZodLiteral<P> } & S>
    >;
}

/* ———————————————————————————————————————————————— *
 *   Helper to generate plugin event definitions
 *    const events = {
 *      ...fromPlugin<OutgoingAgentEvents, typeof agent>()(IncomingAgentEvents)
 *    }
 * ———————————————————————————————————————————————— */

/* UPDATED signature — note the “ = never ” default on T */
export function fromPlugin<
    T extends readonly z.ZodTypeAny[]   // inferred from first argument
  >(incomingEvents: T) {
  return <
    O extends { type: string },   // outgoing‑event union
    P extends string              // plugin literal
  >() => ({
      incoming: incomingEvents,
      outgoing: {} as WithPlugin<P, O>,
    });
}

export function emit<
  P extends string,
  E extends Simplify<Omit<OutgoingPluginEvents, 'plugin'>>
>(
  plugin: P,
  event: E
): {
  type: 'OUTGOING';
  event: Simplify<E & { plugin: P }>;
} {
  // runtime is just an object spread; the heavy lifting is at type level
  return {
    type: 'OUTGOING',
    event: { ...event, plugin } as Simplify<E & { plugin: P }>,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Utility:  Type-safe wrapper for sendParent
 * ────────────────────────────────────────────────────────────────────────── */
export function sendParentSafe<TEvent extends { type: string }>() {
  return <Type extends TEvent['type']>(
    type: Type,
    payload?: Simplify<Omit<Extract<TEvent, { type: Type }>, 'type'>>
  ) => sendParent({ type, ...(payload || {}) });
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Utility:  Extract the specific event(s) out of a union
 * ────────────────────────────────────────────────────────────────────────── */
export type ExtractEvent<
  TEvent extends { type: string },
  TType extends TEvent['type']
> = Extract<TEvent, { type: TType }>;

/* ────────────────────────────────────────────────────────────────────────── *
 *  Factory: safeEvents  ➜  returns “typeOf” for a given event union
 * ────────────────────────────────────────────────────────────────────────── */
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