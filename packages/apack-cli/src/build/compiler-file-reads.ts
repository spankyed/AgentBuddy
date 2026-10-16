import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compilerMetadataOperations, type CompilerMetadataKind } from './compiler-metadata.ts';
import type { CompilationInputs } from './compilation-inputs.ts';

interface CompilerFileReadScope {
  compilation: CompilationInputs;
  outputDirectory: string;
}

const scopes = new AsyncLocalStorage<CompilerFileReadScope>();
let installed = false;

function readScope(file: fs.PathOrFileDescriptor) {
  const scope = scopes.getStore();
  if (!scope || (typeof file !== 'string' && !(file instanceof URL) && !Buffer.isBuffer(file))) return;
  const absolute = path.resolve(file instanceof URL ? fileURLToPath(file) : file.toString());
  const relative = path.relative(scope.outputDirectory, absolute);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) return;
  return { scope, absolute };
}

function readPath(file: fs.PathOrFileDescriptor): fs.PathOrFileDescriptor {
  const input = readScope(file);
  // Capture itself reads the original filesystem; those internal reads must not re-enter the adapter.
  return input ? scopes.exit(() => input.scope.compilation.readDataPath(input.absolute)) : file;
}

function sourceError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const scope = scopes.getStore();
  if (!scope) return error;
  error.message = scopes.exit(() => scope.compilation.readTree().diagnostic(error.message));
  if ('path' in error && typeof error.path === 'string') Object.assign(error, { path: scope.compilation.sourcePath(error.path) });
  return error;
}

function readOnly(flags: unknown): boolean {
  if (flags === undefined) return true;
  if (typeof flags === 'string') return ['r', 'rs', 'sr'].includes(flags);
  const mutating = fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND;
  return typeof flags === 'number' && (flags & mutating) === 0;
}

function callbackRead<T extends (...args: never[]) => unknown>(operation: T,
  file: fs.PathOrFileDescriptor, args: unknown[], capture = true): unknown {
  const callback = args.pop();
  if (typeof callback !== 'function') return Reflect.apply(operation, fs, [file, ...args, callback]);
  let captured: fs.PathOrFileDescriptor;
  try { captured = capture ? readPath(file) : file; }
  catch (error) { queueMicrotask(() => callback(sourceError(error))); return; }
  return Reflect.apply(operation, fs, [captured, ...args,
    (error: unknown, data: unknown) => callback(error ? sourceError(error) : null, data)]);
}

function metadataRead(kind: CompilerMetadataKind, file: fs.PathLike, args: readonly unknown[]) {
  const input = readScope(file);
  return input
    ? scopes.exit(() => input.scope.compilation.readMetadata(kind, input.absolute, args))
    : Reflect.apply(compilerMetadataOperations[kind].sync, fs, [file, ...args]);
}

function metadataSync(kind: CompilerMetadataKind) {
  return (file: fs.PathLike, ...args: unknown[]) => {
    try { return metadataRead(kind, file, args); }
    catch (error) { throw sourceError(error); }
  };
}

function metadataCallback(kind: CompilerMetadataKind) {
  return (file: fs.PathLike, ...args: unknown[]) => {
    const callback = args.pop();
    if (!scopes.getStore() || typeof callback !== 'function') {
      return Reflect.apply(compilerMetadataOperations[kind].callback!, fs, [file, ...args, callback]);
    }
    try {
      const value = metadataRead(kind, file, args);
      queueMicrotask(() => callback(null, value));
    } catch (error) { queueMicrotask(() => callback(sourceError(error))); }
  };
}

function install() {
  if (installed) return;
  installed = true;
  const readSync = fs.readFileSync, read = fs.readFile, readPromise = fs.promises.readFile;
  fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    try { return Reflect.apply(readSync, fs, [readPath(file), ...args]); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.readFileSync;
  fs.readFile = ((file: fs.PathOrFileDescriptor, ...args: unknown[]) => callbackRead(read, file, args)) as typeof fs.readFile;
  fs.promises.readFile = (async (file, ...args) => {
    // A FileHandle already owns its descriptor; its lifetime belongs to the opening operation.
    if (typeof file === 'object' && !(file instanceof URL) && !Buffer.isBuffer(file)) return readPromise(file, ...args);
    try { return await Reflect.apply(readPromise, fs.promises, [readPath(file), ...args]); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.promises.readFile;
  const openSync = fs.openSync, open = fs.open, openPromise = fs.promises.open;
  fs.openSync = ((file: fs.PathLike, flags: fs.OpenMode, ...args: unknown[]) => {
    try { return Reflect.apply(openSync, fs, [readOnly(flags) ? readPath(file) : file, flags, ...args]); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.openSync;
  fs.open = ((file: fs.PathLike, ...args: unknown[]) => callbackRead(open, file, args, readOnly(args[0]))) as typeof fs.open;
  fs.promises.open = (async (file, flags, ...args) => {
    try { return await Reflect.apply(openPromise, fs.promises, [readOnly(flags) ? readPath(file) : file, flags, ...args]); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.promises.open;
  const readdirSync = fs.readdirSync, readdir = fs.readdir, readdirPromise = fs.promises.readdir;
  fs.readdirSync = ((file: fs.PathLike, options: unknown) => {
    const input = readScope(file);
    if (!input) return Reflect.apply(readdirSync, fs, [file, options]);
    try { return scopes.exit(() => input.scope.compilation.readDirectory(input.absolute, options)); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.readdirSync;
  fs.readdir = ((file: fs.PathLike, ...args: unknown[]) => {
    const callback = args.pop();
    const input = readScope(file);
    if (!input || typeof callback !== 'function') return Reflect.apply(readdir, fs, [file, ...args, callback]);
    try {
      const result = scopes.exit(() => input.scope.compilation.readDirectory(input.absolute, args[0]));
      queueMicrotask(() => callback(null, result));
    } catch (error) { queueMicrotask(() => callback(sourceError(error))); }
  }) as typeof fs.readdir;
  fs.promises.readdir = (async (file, options) => {
    const input = readScope(file);
    if (!input) return Reflect.apply(readdirPromise, fs.promises, [file, options]);
    try { return scopes.exit(() => input.scope.compilation.readDirectory(input.absolute, options)); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.promises.readdir;
  const builtins = fs as unknown as Record<string, unknown>;
  const promises = fs.promises as unknown as Record<string, unknown>;
  for (const kind of ['stat', 'lstat', 'realpath', 'readlink', 'access'] as const) {
    builtins[`${kind}Sync`] = metadataSync(kind);
    builtins[kind] = metadataCallback(kind);
    promises[kind] = async (file: fs.PathLike, ...args: unknown[]) => {
      if (!scopes.getStore()) return Reflect.apply(compilerMetadataOperations[kind].promise!, fs.promises, [file, ...args]);
      try { return metadataRead(kind, file, args); }
      catch (error) { throw sourceError(error); }
    };
  }
  fs.realpathSync.native = metadataSync('realpathNative') as typeof fs.realpathSync.native;
  fs.realpath.native = metadataCallback('realpathNative') as typeof fs.realpath.native;
  const exists = compilerMetadataOperations.exists.sync;
  fs.existsSync = ((file: fs.PathLike) => {
    try { return metadataRead('exists', file, []); }
    catch (error) {
      if (error instanceof TypeError) return Reflect.apply(exists, fs, [file]);
      throw sourceError(error);
    }
  }) as typeof fs.existsSync;
  const existsCallback = fs.exists;
  const capturedExists = ((file: fs.PathLike, callback: (exists: boolean) => void) => {
    if (!scopes.getStore() || typeof callback !== 'function') return existsCallback(file, callback);
    const value = fs.existsSync(file);
    queueMicrotask(() => callback(value));
  }) as typeof fs.exists;
  for (const key of Object.getOwnPropertySymbols(existsCallback)) {
    Object.defineProperty(capturedExists, key, Object.getOwnPropertyDescriptor(existsCallback, key)!);
  }
  fs.exists = capturedExists;
  syncBuiltinESMExports();
}

/** Content code owns file bytes through its build scope; unrelated tasks and output reads stay native. */
export function withCompilerFileReads<T>(scope: CompilerFileReadScope, operation: () => Promise<T>): Promise<T> {
  install();
  return scopes.run(scope, operation);
}

/** Input validation must inspect the live filesystem, even when invoked from captured execution. */
export function withoutCompilerFileReads<T>(operation: () => T): T {
  return scopes.exit(operation);
}
