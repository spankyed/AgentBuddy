import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyCompilerValue } from './compiler-metadata.ts';

export interface CompilerDirectoryCursor {
  read(index: number): fs.Dirent | null;
  assertCurrent(): boolean;
  identity(parentPath?: (file: string) => string): string;
  dispose(): void;
}
const open = fs.opendirSync;
const nativeRead = fs.Dir.prototype.read;
const nativeReadSync = fs.Dir.prototype.readSync;
const nativeClose = fs.Dir.prototype.close;
const nativeCloseSync = fs.Dir.prototype.closeSync;
const nativeIterator = fs.Dir.prototype[Symbol.asyncIterator];
const cursors = new WeakMap<fs.Dir, { next(): fs.Dirent | null }>();
const callbacks = new WeakSet<Function>();

function entryKey(entry: fs.Dirent, parentPath: (file: string) => string = file => file) {
  return [entry.name, parentPath(entry.parentPath), entry.isFile(), entry.isDirectory(), entry.isSymbolicLink(),
    entry.isBlockDevice(), entry.isCharacterDevice(), entry.isFIFO(), entry.isSocket()];
}
function errorKey(error: unknown): string {
  return JSON.stringify(error instanceof Error ? Object.fromEntries(Object.getOwnPropertyNames(error)
    .filter(key => key !== 'stack').sort().map(key => [key, Reflect.get(error, key)])) : error);
}

/** Own only the native prefix actually consumed, including its observed terminal outcome. */
export function captureNativeDirectory(file: string, options: unknown): CompilerDirectoryCursor {
  const capturedOptions = options && typeof options === 'object' ? { ...options } : options;
  let source: fs.Dir | undefined = Reflect.apply(open, fs, [file, capturedOptions]);
  const entries: fs.Dirent[] = [];
  let terminal: { ok: true } | { ok: false; error: unknown } | undefined;
  let disposed = false;
  const close = () => { const current = source; source = undefined; if (current) Reflect.apply(nativeCloseSync, current, []); };
  return {
    read(index) {
      if (disposed) throw new Error(`Compiler directory read outlived its compilation: ${file}`);
      if (index < entries.length) return copyCompilerValue(entries[index]!);
      if (!terminal) {
        try {
          const entry = Reflect.apply(nativeReadSync, source!, []) as fs.Dirent | null;
          if (entry) { entries.push(copyCompilerValue(entry)); return copyCompilerValue(entry); }
          terminal = { ok: true };
        } catch (error) { terminal = { ok: false, error: copyCompilerValue(error) }; }
        close();
      }
      if (!terminal.ok) throw copyCompilerValue(terminal.error);
      return null;
    },
    assertCurrent() {
      let current: fs.Dir | undefined;
      try {
        current = Reflect.apply(open, fs, [file, capturedOptions]);
        for (const expected of entries) {
          const entry = current!.readSync();
          if (!entry || JSON.stringify(entryKey(entry)) !== JSON.stringify(entryKey(expected))) return false;
        }
        if (!terminal) return true;
        try { const entry = current!.readSync(); return terminal.ok && entry === null; }
        catch (error) { return !terminal.ok && errorKey(error) === errorKey(terminal.error); }
      } catch { return false; }
      finally { if (current) Reflect.apply(nativeCloseSync, current, []); }
    },
    identity(parentPath = file => file) {
      return JSON.stringify([entries.map(entry => entryKey(entry, parentPath)), terminal === undefined ? 'prefix'
        : terminal.ok ? 'end' : ['error', errorKey(terminal.error)]]);
    },
    dispose() { disposed = true; close(); },
  };
}

function read(this: fs.Dir, callback?: (error: NodeJS.ErrnoException | null, entry?: fs.Dirent | null) => void) {
  const cursor = cursors.get(this);
  if (!cursor || (callback !== undefined && typeof callback !== 'function') || (callback && callbacks.has(callback))) {
    return Reflect.apply(nativeRead, this, [callback]);
  }
  let resolve: ((entry: fs.Dirent | null) => void) | undefined, reject: ((error: unknown) => void) | undefined;
  const promise = callback === undefined ? new Promise<fs.Dirent | null>((yes, no) => { resolve = yes; reject = no; }) : undefined;
  const projected = (error: NodeJS.ErrnoException | null) => {
    let failure: unknown = error;
    let entry: fs.Dirent | null | undefined;
    if (!failure) {
      try { entry = cursor.next(); }
      catch (error) { failure = error; }
    }
    if (callback) callback(failure as NodeJS.ErrnoException | null, entry);
    else if (failure) reject!(failure);
    else resolve!(entry!);
  };
  callbacks.add(projected);
  // Native reads retain closure, receiver checks and operation locking on a real handle.
  Reflect.apply(nativeRead, this, [projected]);
  return promise;
}

async function* iterate(directory: fs.Dir) {
  try {
    for (let entry; (entry = await Reflect.apply(read, directory, [])) !== null;) yield entry;
  } finally { await Reflect.apply(nativeClose, directory, []); }
}

/** A real native handle supplies lifecycle behavior; only its returned entries use the captured view. */
export function openCapturedDirectory(readPath: string, source: string, requested: fs.PathLike,
  options: unknown, readEntry: (index: number) => fs.Dirent | null): fs.Dir {
  const directory = Reflect.apply(open, fs, [readPath, options]);
  const displayed = requested instanceof URL ? fileURLToPath(requested) : requested;
  const base = typeof displayed === 'string' ? displayed : displayed.toString();
  let index = 0;
  cursors.set(directory, { next() {
    const entry = readEntry(index);
    if (!entry) return null;
    index++;
    const relative = path.relative(source, entry.parentPath);
    const parent = relative ? path.join(base, relative) : base;
    entry.parentPath = Buffer.isBuffer(displayed) ? Buffer.from(parent) as unknown as string : parent;
    return entry;
  } });
  Object.defineProperty(directory, 'path', { configurable: true, value: displayed });
  directory.read = read as typeof directory.read;
  directory.readSync = function(this: fs.Dir) {
    const native = Reflect.apply(nativeReadSync, this, []);
    const cursor = cursors.get(this);
    return cursor ? cursor.next() : native;
  };
  directory[Symbol.asyncIterator] = function(this: fs.Dir) {
    return cursors.has(this) ? iterate(this) : Reflect.apply(nativeIterator, this, []);
  };
  return directory;
}
