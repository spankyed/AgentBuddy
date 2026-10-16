import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CompilerDirectoryResult } from './compiler-file-view.ts';

export type CompilerDirectoryMethod = 'readdir' | 'opendir';
const open = fs.opendirSync;
const nativeRead = fs.Dir.prototype.read;
const nativeReadSync = fs.Dir.prototype.readSync;
const nativeIterator = fs.Dir.prototype[Symbol.asyncIterator];
const cursors = new WeakMap<fs.Dir, { entries: fs.Dirent[]; index: number }>();
const callbacks = new WeakSet<Function>();

/** Capture opendir's own traversal order and options rather than substituting readdir semantics. */
export function readNativeDirectory(file: string, options: unknown): CompilerDirectoryResult {
  const directory = Reflect.apply(open, fs, [file, options]);
  const entries: fs.Dirent[] = [];
  try {
    for (let entry; (entry = directory.readSync()) !== null;) entries.push(entry);
  } finally { directory.closeSync(); }
  return entries;
}

function read(this: fs.Dir, callback?: (error: NodeJS.ErrnoException | null, entry?: fs.Dirent | null) => void) {
  const cursor = cursors.get(this);
  if (!cursor || (callback !== undefined && typeof callback !== 'function') || (callback && callbacks.has(callback))) {
    return Reflect.apply(nativeRead, this, [callback]);
  }
  let resolve: ((entry: fs.Dirent | null) => void) | undefined, reject: ((error: unknown) => void) | undefined;
  const promise = callback === undefined ? new Promise<fs.Dirent | null>((yes, no) => { resolve = yes; reject = no; }) : undefined;
  const projected = (error: NodeJS.ErrnoException | null) => {
    const entry = error ? undefined : cursor.entries[cursor.index++] ?? null;
    if (callback) callback(error, entry);
    else if (error) reject!(error);
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
  } finally { await directory.close(); }
}

/** A real native handle supplies lifecycle behavior; only its returned entries use the captured view. */
export function openCapturedDirectory(readPath: string, source: string, requested: fs.PathLike,
  options: unknown, entries: CompilerDirectoryResult): fs.Dir {
  const directory = Reflect.apply(open, fs, [readPath, options]);
  const displayed = requested instanceof URL ? fileURLToPath(requested) : requested;
  const base = typeof displayed === 'string' ? displayed : displayed.toString();
  const values = entries as fs.Dirent[];
  for (const entry of values) {
    const relative = path.relative(source, entry.parentPath);
    const parent = relative ? path.join(base, relative) : base;
    entry.parentPath = Buffer.isBuffer(displayed) ? Buffer.from(parent) as unknown as string : parent;
  }
  cursors.set(directory, { entries: values, index: 0 });
  Object.defineProperty(directory, 'path', { configurable: true, value: displayed });
  directory.read = read as typeof directory.read;
  directory.readSync = function(this: fs.Dir) {
    const native = Reflect.apply(nativeReadSync, this, []);
    const cursor = cursors.get(this);
    return cursor ? cursor.entries[cursor.index++] ?? null : native;
  };
  directory[Symbol.asyncIterator] = function(this: fs.Dir) {
    return cursors.has(this) ? iterate(this) : Reflect.apply(nativeIterator, this, []);
  };
  return directory;
}
