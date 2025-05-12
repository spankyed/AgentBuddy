import { sendParent } from 'xstate';
import type { Simplify } from './plugin-bus';

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