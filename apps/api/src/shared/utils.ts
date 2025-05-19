// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const isObject = (val: any) => typeof val === 'object' && val !== null;

export function toArray<T>(arg: T | T[]): T[] {
  return Array.isArray(arg) ? arg : [arg];
}

export function removeLineBreaks(input: string): string {
  return input.replace(/\r?\n|\r/g, "");
}