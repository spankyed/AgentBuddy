import { z, type ZodRawShape } from 'zod';
import type { OutgoingPluginEvents } from './events';

/* ———————————————————————————————————————————————— *
 *  Utilities to keep IDE tooltips tidy
 * ———————————————————————————————————————————————— */
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type StripPlugin<T> = T extends { plugin: string } ? Omit<T, 'plugin'> : T;

// From a readonly array of Zod schemas → union of inferred objects
export type EventsFromSchemas<
  S extends readonly z.ZodTypeAny[]
> = { [K in keyof S]: z.infer<S[K]> }[number];
export type EventsWithoutPlugin<
  S extends readonly z.ZodTypeAny[]
> = Simplify<StripPlugin<EventsFromSchemas<S>>>;

/* ———————————————————————————————————————————————— *
 * 3. Factory that bakes a fixed `plugin` literal in
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

export function emit<
  P extends string,
  E extends OutgoingPluginEvents
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