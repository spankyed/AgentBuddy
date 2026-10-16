import fs from 'node:fs';
import { inspect } from 'node:util';

export type CompilerMetadataKind = 'stat' | 'lstat' | 'realpath' | 'realpathNative' | 'readlink' | 'access' | 'exists';
type NativeOperation = (...args: never[]) => unknown;

/** Keep the native operations before scoped adapters replace the public builtin exports. */
export const compilerMetadataOperations: Record<CompilerMetadataKind, {
  sync: NativeOperation; callback?: NativeOperation; promise?: NativeOperation;
}> = {
  stat: { sync: fs.statSync, callback: fs.stat, promise: fs.promises.stat },
  lstat: { sync: fs.lstatSync, callback: fs.lstat, promise: fs.promises.lstat },
  realpath: { sync: fs.realpathSync, callback: fs.realpath, promise: fs.promises.realpath },
  realpathNative: { sync: fs.realpathSync.native, callback: fs.realpath.native },
  readlink: { sync: fs.readlinkSync, callback: fs.readlink, promise: fs.promises.readlink },
  access: { sync: fs.accessSync, callback: fs.access, promise: fs.promises.access },
  exists: { sync: fs.existsSync },
};

type MetadataOutcome = { ok: true; value: unknown } | { ok: false; error: unknown };

function copyValue<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) if ('value' in descriptor) descriptor.value = copyValue(descriptor.value);
  const copy = value instanceof Error
    ? value instanceof TypeError ? new TypeError(value.message) : value instanceof RangeError ? new RangeError(value.message) : new Error(value.message)
    : Object.create(Object.getPrototypeOf(value));
  Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  return Object.defineProperties(copy, descriptors);
}

function valueKey(value: unknown): string {
  return JSON.stringify(value, (_key, value: unknown) => typeof value === 'bigint' ? { bigint: value.toString() } : value) ?? 'undefined';
}

function outcomeKey(outcome: MetadataOutcome): string {
  if (outcome.ok) return valueKey(outcome.value);
  const error = outcome.error;
  return valueKey(error instanceof Error ? Object.fromEntries(Object.getOwnPropertyNames(error)
    .filter(key => key !== 'stack').map(key => [key, Reflect.get(error, key)])) : error);
}

/** One native query owns its value; stat validation follows the fields actually consumed. */
export function captureCompilerMetadata(kind: CompilerMetadataKind, file: string, args: readonly unknown[]) {
  const options = args.map(arg => arg && typeof arg === 'object' ? { ...arg } : arg);
  const read = (): MetadataOutcome => {
    try { return { ok: true, value: Reflect.apply(compilerMetadataOperations[kind].sync, fs, [file, ...options]) }; }
    catch (error) { return { ok: false, error }; }
  };
  const outcome = read();
  const fields = new Set<PropertyKey>();
  const isStats = outcome.ok && (kind === 'stat' || kind === 'lstat') && outcome.value !== undefined;
  const identity = () => isStats ? valueKey([...fields].sort((a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0).map(key => [String(key), Reflect.get(outcome.value as object, key)])) : outcomeKey(outcome);
  return {
    identity,
    value() {
      if (!outcome.ok) throw copyValue(outcome.error);
      const copy = copyValue(outcome.value);
      if (!isStats) return copy;
      const getters = new Map<PropertyKey, () => unknown>();
      for (const key of Reflect.ownKeys(copy as object)) {
        const descriptor = Object.getOwnPropertyDescriptor(copy, key)!;
        if (!('value' in descriptor)) continue;
        let value: unknown = descriptor.value;
        let mutated = false;
        const get = () => { if (!mutated) fields.add(key); return value; };
        getters.set(key, get);
        Object.defineProperty(copy, key, { configurable: descriptor.configurable, enumerable: descriptor.enumerable, get,
          ...(descriptor.writable && { set(next: unknown) { mutated = true; value = next; } }) });
      }
      Object.defineProperty(copy, inspect.custom, { configurable: true, value() {
        const descriptors = Object.getOwnPropertyDescriptors(copy);
        Reflect.deleteProperty(descriptors, inspect.custom);
        for (const key of Reflect.ownKeys(descriptors)) {
          const descriptor = Reflect.get(descriptors, key) as PropertyDescriptor;
          if (descriptor.get === getters.get(key)) Reflect.set(descriptors, key, {
            configurable: descriptor.configurable, enumerable: descriptor.enumerable, writable: true, value: Reflect.get(copy as object, key),
          });
        }
        return Object.create(Object.getPrototypeOf(copy), descriptors);
      } });
      return copy;
    },
    assertCurrent() {
      const current = read();
      if (!current.ok || !isStats) return outcomeKey(current) === outcomeKey(outcome);
      if (!current.value || typeof current.value !== 'object') return false;
      return fields.size === 0 || [...fields].every(key => valueKey(Reflect.get(current.value as object, key)) === valueKey(Reflect.get(outcome.value as object, key)));
    },
  };
}
