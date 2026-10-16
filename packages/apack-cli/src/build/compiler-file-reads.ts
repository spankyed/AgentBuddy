import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { CompilationInputs } from './compilation-inputs.ts';

interface CompilerFileReadScope {
  compilation: CompilationInputs;
  outputDirectory: string;
}

const scopes = new AsyncLocalStorage<CompilerFileReadScope>();
let installed = false;

function readPath(file: fs.PathOrFileDescriptor): fs.PathOrFileDescriptor {
  const scope = scopes.getStore();
  if (!scope || typeof file === 'number') return file;
  const source = file instanceof URL ? fileURLToPath(file) : file.toString();
  const absolute = path.resolve(source);
  const relative = path.relative(scope.outputDirectory, absolute);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) return file;
  // Capture itself reads the original filesystem; those internal reads must not re-enter the adapter.
  return scopes.exit(() => scope.compilation.readDataPath(absolute));
}

function sourceError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const scope = scopes.getStore();
  if (!scope) return error;
  error.message = scope.compilation.readTree().diagnostic(error.message);
  if ('path' in error && typeof error.path === 'string') Object.assign(error, { path: scope.compilation.sourcePath(error.path) });
  return error;
}

function install() {
  if (installed) return;
  installed = true;
  const readSync = fs.readFileSync, read = fs.readFile, readPromise = fs.promises.readFile;
  fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    try { return Reflect.apply(readSync, fs, [readPath(file), ...args]); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.readFileSync;
  fs.readFile = ((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    const callback = args.pop();
    if (typeof callback !== 'function') return Reflect.apply(read, fs, [file, ...args, callback]);
    let captured: fs.PathOrFileDescriptor;
    try { captured = readPath(file); }
    catch (error) { queueMicrotask(() => callback(sourceError(error))); return; }
    return Reflect.apply(read, fs, [captured, ...args, (error: unknown, data: unknown) => callback(error ? sourceError(error) : null, data)]);
  }) as typeof fs.readFile;
  fs.promises.readFile = (async (file, ...args) => {
    // A FileHandle already owns its descriptor; its lifetime belongs to the opening operation.
    if (typeof file === 'object' && !(file instanceof URL) && !Buffer.isBuffer(file)) return readPromise(file, ...args);
    try { return await Reflect.apply(readPromise, fs.promises, [readPath(file), ...args]); }
    catch (error) { throw sourceError(error); }
  }) as typeof fs.promises.readFile;
  syncBuiltinESMExports();
}

/** Content code owns file bytes through its build scope; unrelated tasks and output reads stay native. */
export function withCompilerFileReads<T>(scope: CompilerFileReadScope, operation: () => Promise<T>): Promise<T> {
  install();
  return scopes.run(scope, operation);
}
