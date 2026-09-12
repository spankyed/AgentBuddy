export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;

export type MaybeArr<T> = T | readonly T[];
export function asArr<T>(v: MaybeArr<T>): readonly T[] {
  return (Array.isArray(v) ? v : [v]) as readonly T[];
}

export const entries = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj) as Array<[keyof T, T[keyof T]]>

export function toDisplayName(str: string): string {
  return str.replace(/-/g, ' ');
}

export function extractValueByPath(source: any, path: string): any {
  if (!path || path === '$') return source;
  const cleanPath = path.startsWith('$.') ? path.slice(2) : path;
  const segments = cleanPath.split('.');

  let current = source;
  for (const segment of segments) {
    if (current == null) return undefined;

    const selector = segment.match(/^(\w+)\[(\w+)=([^\]]+)\]$/);
    if (selector) {
      const [, arrayName, field, value] = selector;
      const arr = current[arrayName];
      if (!Array.isArray(arr)) return undefined;
      current = arr.find((item: any) => item?.[field] === value);
    } else {
      current = current[segment];
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
