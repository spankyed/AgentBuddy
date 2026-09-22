/** A non-null object that isn't an array */
export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

/** `over` on `base`: plain objects merge key by key, an undefined value keeps the base's, anything else replaces it */
export function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(over)) return over as T;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) result[key] = deepMerge(base[key], value);
  return result as T;
}

export type MaybeArr<T> = T | readonly T[];
export function asArr<T>(v: MaybeArr<T>): readonly T[] {
  return (Array.isArray(v) ? v : [v]) as readonly T[];
}

export const entries = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj) as Array<[keyof T, T[keyof T]]>

export function toDisplayName(str: string): string {
  return str.replace(/-/g, ' ');
}

export function extractValueByPath(source: unknown, path: string): unknown {
  if (!path || path === '$') return source;
  const cleanPath = path.startsWith('$.') ? path.slice(2) : path;
  const segments = cleanPath.split('.');

  let current = source;
  for (const segment of segments) {
    if (current == null) return undefined;
    const record = current as Record<string, unknown>;

    const selector = segment.match(/^(\w+)\[(\w+)=([^\]]+)\]$/);
    if (selector) {
      const [, arrayName, field, value] = selector;
      const arr = record[arrayName];
      if (!Array.isArray(arr)) return undefined;
      current = arr.find((item: Record<string, unknown> | null | undefined) => item?.[field] === value);
    } else {
      current = record[segment];
    }
  }
  return current;
}

export enum BinaryOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_THAN_OR_EQUALS = 'greater_than_or_equals',
  LESS_THAN_OR_EQUALS = 'less_than_or_equals',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  MATCHES = 'matches',
  IS_EMPTY = 'is_empty',
  IS_NULL = 'is_null',
}
