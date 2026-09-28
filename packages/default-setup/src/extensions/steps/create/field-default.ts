import type { FieldMapping } from '@abuddy/sdk/steps';

/**
 * A mapping's fallback, between the text box a user types in and the value the runtime stores.
 *
 * Shared by the editors that offer one — the mapping list in `fields.vue` (create, update, transform) and the
 * per-parameter boxes in the action and llm forms — because the rule is the same wherever it is typed, and a
 * second copy of it is what left this pack with eight descriptions of one record.
 */

/** A stored fallback as its box shows it; a string stays itself, so text does not come back quoted */
export const writtenDefault = (value: unknown): string => {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
};

/**
 * What was typed, as the runtime reads a literal source: JSON when it parses, the text itself otherwise.
 *
 * An empty box is `undefined`, which means the caller drops the key rather than storing `''` — the runtime asks
 * `default !== undefined`, so a mapping carrying an empty string is one that always has a fallback.
 */
export const parsedDefault = (typed: string): unknown => {
  if (typed === '') return undefined;
  try {
    return JSON.parse(typed) as unknown;
  } catch {
    return typed;
  }
};

/** `mapping` with `typed` as its fallback, or with no `default` key at all when the box is empty */
export function withDefault<T extends FieldMapping>(mapping: T, typed: string): T {
  const value = parsedDefault(typed);
  if (value === undefined) {
    const { default: _dropped, ...rest } = mapping;
    return rest as T;
  }
  return { ...mapping, default: value };
}
