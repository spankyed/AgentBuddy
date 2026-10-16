import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import module, { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { openCapturedDirectory } from './compiler-directories.ts';
import { capturedDescriptor, descriptorStats, releaseDescriptor, instrumentFileHandle, rememberDescriptor } from './compiler-descriptors.ts';
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
  error.message = scope.compilation.diagnostic(error.message);
  if ('path' in error && typeof error.path === 'string') {
    const source = scope.compilation.sourcePath(error.path);
    error.message = error.message.split(error.path).join(source);
    Object.assign(error, { path: source });
  }
  return error;
}

function readOnly(flags: unknown): boolean {
  if (flags === undefined) return true;
  if (typeof flags === 'string') return ['r', 'rs', 'sr'].includes(flags);
  const mutating = fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND;
  return typeof flags === 'number' && (flags & mutating) === 0;
}

function callbackRead<T extends (...args: never[]) => unknown>(operation: T,
  file: fs.PathOrFileDescriptor, args: unknown[], capture = true, opened?: (fd: number) => void): unknown {
  const callback = args.pop();
  if (typeof callback !== 'function') return Reflect.apply(operation, fs, [file, ...args, callback]);
  let captured: fs.PathOrFileDescriptor;
  try { captured = capture ? readPath(file) : file; }
  catch (error) { queueMicrotask(() => callback(sourceError(error))); return; }
  return Reflect.apply(operation, fs, [captured, ...args,
    (error: unknown, data: unknown) => {
      if (!error && opened) {
        try { opened(data as number); }
        catch (error) { callback(sourceError(error)); return; }
      }
      callback(error ? sourceError(error) : null, data);
    }]);
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

function descriptorInput(file: fs.PathLike, flags: unknown) {
  const input = readOnly(flags) ? readScope(file) : undefined;
  return input && { readStats: (args: readonly unknown[]) =>
    scopes.exit(() => input.scope.compilation.readMetadata('stat', input.absolute, args)) };
}

function capturedDirectory(file: fs.PathLike, options: unknown) {
  const input = readScope(file);
  if (!input) return;
  return scopes.exit(() => {
    const cursor = input.scope.compilation.openDirectory(input.absolute, options);
    return openCapturedDirectory(input.scope.compilation.readDataPath(input.absolute), input.absolute, file, options, index => scopes.exit(() => cursor.read(index)));
  });
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
    try {
      const owner = descriptorInput(file, flags);
      const fd = Reflect.apply(openSync, fs, [readOnly(flags) ? readPath(file) : file, flags, ...args]);
      rememberDescriptor(fd, owner);
      return fd;
    } catch (error) { throw sourceError(error); }
  }) as typeof fs.openSync;
  fs.open = ((file: fs.PathLike, ...args: unknown[]) => {
    const flags = typeof args[0] === 'function' ? undefined : args[0];
    const owner = descriptorInput(file, flags);
    return callbackRead(open, file, args, readOnly(flags), fd => rememberDescriptor(fd, owner));
  }) as typeof fs.open;
  fs.promises.open = (async (file, flags, ...args) => {
    try {
      const owner = descriptorInput(file, flags);
      const handle = await Reflect.apply(openPromise, fs.promises, [readOnly(flags) ? readPath(file) : file, flags, ...args]);
      rememberDescriptor(handle.fd, owner);
      return owner ? instrumentFileHandle(handle) : handle;
    } catch (error) { throw sourceError(error); }
  }) as typeof fs.promises.open;
  const fstatSync = fs.fstatSync, fstat = fs.fstat, closeSync = fs.closeSync, close = fs.close;
  fs.fstatSync = ((fd: number, ...args: unknown[]) => {
    const captured = capturedDescriptor(fd);
    try { return descriptorStats(fd, Reflect.apply(fstatSync, fs, [fd, ...args]), args, captured); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EBADF') releaseDescriptor(fd, captured); throw sourceError(error); }
  }) as typeof fs.fstatSync;
  fs.fstat = ((fd: number, ...args: unknown[]) => {
    const callback = args.pop(), captured = capturedDescriptor(fd);
    if (typeof callback !== 'function') return Reflect.apply(fstat, fs, [fd, ...args, callback]);
    return Reflect.apply(fstat, fs, [fd, ...args, (error: NodeJS.ErrnoException | null, actual: fs.Stats | fs.BigIntStats) => {
      if (error) {
        if (error.code === 'EBADF') releaseDescriptor(fd, captured);
        callback(sourceError(error));
      } else {
        let value: unknown;
        try { value = descriptorStats(fd, actual, args, captured); }
        catch (error) { callback(sourceError(error)); return; }
        callback(null, value);
      }
    }]);
  }) as typeof fs.fstat;
  fs.closeSync = (fd => { const captured = capturedDescriptor(fd); closeSync(fd); releaseDescriptor(fd, captured); }) as typeof fs.closeSync;
  fs.close = ((fd: number, callback: (error: NodeJS.ErrnoException | null) => void) => {
    const captured = capturedDescriptor(fd);
    if (typeof callback !== 'function') return close(fd, callback);
    return close(fd, error => { if (!error || error.code === 'EBADF') releaseDescriptor(fd, captured); callback(error); });
  }) as typeof fs.close;
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
  const opendirSync = fs.opendirSync, opendir = fs.opendir, opendirPromise = fs.promises.opendir;
  fs.opendirSync = ((file: fs.PathLike, options: unknown) => {
    try { return capturedDirectory(file, options) ?? Reflect.apply(opendirSync, fs, [file, options]); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.opendirSync;
  fs.opendir = ((file: fs.PathLike, ...args: unknown[]) => {
    const callback = args.pop();
    if (!scopes.getStore() || typeof callback !== 'function') return Reflect.apply(opendir, fs, [file, ...args, callback]);
    try {
      const directory = capturedDirectory(file, args[0]);
      if (!directory) return Reflect.apply(opendir, fs, [file, ...args, callback]);
      queueMicrotask(() => callback(null, directory));
    } catch (error) { queueMicrotask(() => callback(sourceError(error))); }
  }) as typeof fs.opendir;
  fs.promises.opendir = (async (file, options) => {
    try { return capturedDirectory(file, options) ?? await Reflect.apply(opendirPromise, fs.promises, [file, options]); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.promises.opendir;
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
  const createRequire = module.createRequire;
  module.createRequire = (filename => {
    const scope = scopes.getStore();
    if (!scope) return createRequire(filename);
    const url = filename instanceof URL ? filename : typeof filename === 'string' && filename.startsWith('file:') ? new URL(filename) : undefined;
    if (url ? url.protocol !== 'file:' : typeof filename !== 'string' || !path.isAbsolute(filename)) return createRequire(filename);
    const file = url ? fileURLToPath(url) : filename as string;
    return scopes.exit(() => {
      // Existing owned module/compiler paths already have their correct native resolution context.
      if (scope.compilation.sourcePath(file) !== file) return createRequire(filename);
      // Match Node's directory-parent convention without admitting the directory above it.
      const parent = file.endsWith('/') || (process.platform === 'win32' && file.endsWith('\\'))
        ? path.join(file, 'noop.js') : file;
      scope.compilation.prepareNative(parent, path.dirname(parent));
      return createRequire(scope.compilation.readTree().path(parent));
    });
  }) as typeof module.createRequire;
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
