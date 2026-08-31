export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;

export type MaybeArr<T> = T | readonly T[];
export function asArr<T>(v: MaybeArr<T>): readonly T[] {
  return (Array.isArray(v) ? v : [v]) as readonly T[];
}

export const entries = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj) as Array<[keyof T, T[keyof T]]>
