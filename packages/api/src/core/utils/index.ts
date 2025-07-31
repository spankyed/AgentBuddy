export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;

export function toArray<T>(arg: T | T[]): T[] {
  return Array.isArray(arg) ? arg : [arg];
}

export type MaybeArr<T> = T | readonly T[];
export function asArr<T>(v: MaybeArr<T>): readonly T[] {
  // `as readonly T[]` silences the widening TS does on `[v]`
  return (Array.isArray(v) ? v : [v]) as readonly T[];
}

export function removeLineBreaks(input: string): string {
  return input.replace(/\r?\n|\r/g, "");
}

export function mergeObjs<T extends object>(a: T, b: Partial<T>): T {
  return { ...a, ...b };
}

export const entries = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj) as Array<[keyof T, T[keyof T]]>
