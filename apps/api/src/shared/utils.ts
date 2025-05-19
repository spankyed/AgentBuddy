// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;

export function toArray<T>(arg: T | T[]): T[] {
  return Array.isArray(arg) ? arg : [arg];
}

export function removeLineBreaks(input: string): string {
  return input.replace(/\r?\n|\r/g, "");
}

export function mergeObjs<T extends object>(a: T, b: Partial<T>): T {
  return { ...a, ...b };
}