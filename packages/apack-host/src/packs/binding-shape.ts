import { isPlainObject } from '@apackdev/sdk/utils/pure';

export function namedBindings(actual: unknown, key: string, expected: readonly string[]): Map<string, Record<string, unknown>> | undefined {
  if (actual === undefined) actual = [];
  if (!Array.isArray(actual)) return;
  const bindings = new Map<string, Record<string, unknown>>();
  for (const binding of actual) {
    if (!isPlainObject(binding) || typeof binding[key] !== 'string' || bindings.has(binding[key])) return;
    bindings.set(binding[key], binding);
  }
  return sameNames([...bindings.keys()], expected) ? bindings : undefined;
}

export function sameNames(actual: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(actual) || actual.some(name => typeof name !== 'string')) return false;
  const names = new Set(actual);
  return names.size === actual.length && names.size === expected.length && expected.every(name => names.has(name));
}

export function sameKeys(actual: unknown, expected: readonly string[]): boolean {
  return isPlainObject(actual) && sameNames(Object.keys(actual), expected);
}
