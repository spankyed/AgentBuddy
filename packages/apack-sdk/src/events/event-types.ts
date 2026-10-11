/** The `type` of each member of an event union */
export type TypeOfEvent<E> = E extends { type: infer K extends string } ? K : never;

type Missing<E, T extends readonly string[]> = Exclude<TypeOfEvent<E>, T[number]>;

/**
 * The event types of the union `E` as a value the app can check a send against, since a union of shapes can't be
 * enumerated at runtime: `eventTypes<MyEvents>()('A', 'B')`. The list fails to compile unless it names every type of
 * `E` and nothing else, so it can't drift from the union.
 */
export const eventTypes = <E extends { type: string }>() =>
  <const T extends readonly TypeOfEvent<E>[]>(...types: T & ([Missing<E, T>] extends [never] ? unknown : { missing: Missing<E, T> })): T => types;
