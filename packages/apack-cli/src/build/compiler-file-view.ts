import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCompilerInputObservations, hashCompilerInputObservations } from './compiler-observations.ts';
import type ts from 'typescript';
import type { BuildInputKind, BuildInputObserver } from '@apackdev/host/build/pack-inputs';
import { compilerSourcePath, type CompilerPathMapping } from './compiler-paths.ts';
import { captureNativeDirectory, type CompilerDirectoryCursor } from './compiler-directories.ts';
import { captureCompilerMetadata, compilerMetadataOperations, type CompilerMetadataKind } from './compiler-metadata.ts';
import { physicalWatchPath } from './watch-paths.ts';

export type CompilerFileSystem = Pick<ts.System,
  'readFile' | 'fileExists' | 'directoryExists' | 'getDirectories' | 'readDirectory'> & { realpath(file: string): string };

interface FileState {
  physical: string;
  kind: 'file' | 'directory' | 'missing' | 'other';
  mode: number;
}

interface FileInput extends FileState { file: string; slot: string }
export type CompilerDirectoryResult = Array<string | Buffer | fs.Dirent<string> | fs.Dirent<Buffer>>;

/** Keep mutable names, arrays and Dirent fields outside the captured query authority. */
function copyDirectoryResult(result: CompilerDirectoryResult): CompilerDirectoryResult {
  return result.map(entry => {
    if (typeof entry === 'string') return entry;
    if (Buffer.isBuffer(entry)) return Buffer.from(entry);
    const copy = Object.create(Object.getPrototypeOf(entry), Object.getOwnPropertyDescriptors(entry));
    for (const key of Reflect.ownKeys(copy)) if (Buffer.isBuffer(copy[key])) copy[key] = Buffer.from(copy[key]);
    return copy;
  });
}

function directoryResultKey(result: CompilerDirectoryResult, parentPath: (file: string) => string = file => file): string {
  return JSON.stringify(result.map(entry => typeof entry === 'string' || Buffer.isBuffer(entry) ? entry : {
    name: entry.name, parentPath: parentPath(entry.parentPath),
    kind: [entry.isFile(), entry.isDirectory(), entry.isSymbolicLink(), entry.isBlockDevice(),
      entry.isCharacterDevice(), entry.isFIFO(), entry.isSocket()],
  }));
}

interface DirectoryEntry { name: string; kind: string }

/** Match TypeScript's BOM handling while keeping the original bytes as an input. */
function sourceText(bytes: Buffer): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return Buffer.from(bytes.subarray(0, bytes.length & ~1)).swap16().toString('utf16le', 2);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.toString('utf16le', 2);
  return bytes.toString('utf8', bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0);
}

/** One scan consumes owned query results and bytes; validation never changes that view. */
export function createCompilerFileView(root: string, options: {
  paths?: readonly CompilerPathMapping[];
  excluded?: (file: string) => boolean;
  observe?: BuildInputObserver;
} = {}) {
  const excluded = options.excluded ?? (() => false);
  const paths = options.paths?.map(mapping => ({ ...mapping })) ?? [];
  const origin = compilerSourcePath(fs.realpathSync(root), paths);
  const observe = options.observe;
  let disposed = false;
  const assertOpen = () => { if (disposed) throw new Error('Compiler input operation outlived its build'); };
  const relative = (file: string) => path.relative(origin, compilerSourcePath(file, paths)).split(path.sep).join('/');
  const physical = new Map<string, string>();
  const inputs = new Map<string, FileInput>();
  const contents = new Map<string, Buffer | undefined>();
  const dataStats = new Map<string, { normal: fs.Stats; bigint: fs.BigIntStats }>();
  const directories = new Map<string, { file: string; entries: DirectoryEntry[] }>();
  const globs = new Map<string, { args: Parameters<ts.System['readDirectory']>; files: string[]; read: ts.System['readDirectory'] }>();
  const included = new Set<string>();
  const metadata = new Map<string, { file: string; kind: CompilerMetadataKind; args: readonly unknown[]; query: ReturnType<typeof captureCompilerMetadata> }>();
  const directoryQueries = new Map<string, { file: string; physical: string; options: unknown; result: CompilerDirectoryResult; key: string }>();
  const directoryCursors = new Map<string, { file: string; options: unknown; cursor: CompilerDirectoryCursor }>();

  function state(file: string, paths: Map<string, string>): FileState {
    const target = physicalWatchPath(file, paths);
    let stat: fs.Stats | undefined;
    try { stat = fs.statSync(target, { throwIfNoEntry: false }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error; }
    return { physical: target, kind: stat?.isFile() ? 'file' : stat?.isDirectory() ? 'directory' : stat ? 'other' : 'missing', mode: stat ? stat.mode & 0o777 : 0 };
  }

  function input(file: string, kind: BuildInputKind): FileInput | undefined {
    assertOpen();
    file = path.resolve(file);
    observe?.(file, kind);
    if (excluded(file) && !included.has(file)) return;
    let value = inputs.get(file);
    if (!value) {
      value = { file, ...state(file, physical), slot: path.join(physicalWatchPath(path.dirname(file), physical), path.basename(file)) };
      inputs.set(file, value);
    }
    if (included.has(file)) included.add(value.physical);
    return value;
  }

  const bytes = (file: string): Buffer | undefined => {
    try { return fs.readFileSync(file); }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
  };
  function captureDataStats(file: string, bytes?: Buffer) {
    if (dataStats.has(file)) return;
    const normal = Reflect.apply(compilerMetadataOperations.stat.sync, fs, [file]) as fs.Stats;
    const bigint = Reflect.apply(compilerMetadataOperations.stat.sync, fs, [file, { bigint: true }]) as fs.BigIntStats;
    if ((bytes && normal.size !== bytes.length)
      || ['dev', 'ino', 'mode', 'size'].some(key => Reflect.get(normal, key) !== Number(Reflect.get(bigint, key)))) {
      throw new Error(`Compiler input changed during capture: ${file}`);
    }
    dataStats.set(file, { normal, bigint });
  }
  function readBytes(file: string): Buffer | undefined {
    const node = input(file, 'file');
    if (node?.kind !== 'file') return;
    if (!contents.has(node.physical)) {
      const value = bytes(node.physical);
      if (value !== undefined) captureDataStats(node.physical, value);
      contents.set(node.physical, value);
    }
    const value = contents.get(node.physical);
    return value === undefined ? undefined : Buffer.from(value);
  }
  function entries(file: string, directory: string): DirectoryEntry[] {
    return fs.readdirSync(directory, { withFileTypes: true }).filter(entry => !excluded(path.join(file, entry.name)))
      .map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'link' : 'other' }))
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }
  function listing(file: string): DirectoryEntry[] {
    const node = input(file, 'entries');
    if (node?.kind !== 'directory') return [];
    let value = directories.get(node.physical);
    if (!value) {
      value = { file: node.file, entries: entries(node.file, node.physical) };
      directories.set(node.physical, value);
    }
    return value.entries;
  }

  const fileSystem: Omit<CompilerFileSystem, 'readDirectory'> = {
    readFile(file) {
      const value = readBytes(file);
      return value === undefined ? undefined : sourceText(value);
    },
    fileExists: file => input(file, 'file')?.kind === 'file',
    directoryExists: file => input(file, 'directory')?.kind === 'directory',
    getDirectories(file) {
      return listing(file).filter(entry => entry.kind === 'directory'
        || (entry.kind === 'link' && fileSystem.directoryExists(path.join(file, entry.name)))).map(entry => entry.name);
    },
    realpath: file => input(file, 'file')?.physical ?? path.resolve(file),
  };

  input(root, 'directory');
  const changed = (file: string): never => { throw new Error(`Compiler resolution namespace changed during discovery: ${file}`); };
  const ancestors = (file: string) => {
    assertOpen();
    const values: FileInput[] = [];
    const boundary = paths.find(mapping => {
      const relative = path.relative(mapping.captured, path.resolve(file));
      return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    })?.captured;
    if (boundary === path.resolve(file)) return values;
    for (let directory = path.dirname(path.resolve(file)); ; directory = path.dirname(directory)) {
      const value = input(directory, 'directory');
      if (value) values.push({ ...value });
      if (directory === boundary || path.dirname(directory) === directory) break;
    }
    return values;
  };
  const observations = () => {
    assertOpen();
    const result = createCompilerInputObservations(origin);
    for (const [file, bytes] of contents) result.record(['file', relative(file)], bytes === undefined ? null : createHash('sha256').update(bytes).digest('hex'));
    for (const value of inputs.values()) result.record(['namespace', relative(value.slot)], [relative(value.physical), value.kind, value.kind === 'file' ? value.mode & 0o111 : 0]);
    for (const [directory, value] of directories) result.record(['entries', relative(directory)], value.entries);
    for (const value of globs.values()) {
      const pattern = (pattern: string) => path.isAbsolute(pattern) ? path.relative(value.args[0], pattern).split(path.sep).join('/') : pattern;
      const patterns = value.args.slice(1).map(arg => Array.isArray(arg) ? arg.map(pattern) : arg);
      result.record(['glob', relative(physicalWatchPath(value.args[0], physical)), patterns], value.files.map(file => path.relative(value.args[0], file).split(path.sep).join('/')));
    }
    for (const query of directoryQueries.values()) result.record(['node-directory', relative(query.file), query.options], JSON.parse(directoryResultKey(query.result, relative)));
    for (const entry of metadata.values()) for (const [query, value] of entry.query.facts(relative)) result.record(['node-metadata', entry.kind, relative(entry.file), entry.args, ...query], value);
    for (const query of directoryCursors.values()) for (const [index, value] of query.cursor.facts(relative)) result.record(['node-opendir', relative(query.file), query.options, index], value);
    return result.snapshot();
  };
  return {
    excluded,
    fileSystem,
    // Keep native capture usable before compiler activation; the compiler owns glob semantics.
    readGlob(read: ts.System['readDirectory'], ...args: Parameters<ts.System['readDirectory']>) {
      if (input(args[0], 'entries')?.kind !== 'directory') return [];
      const query: Parameters<ts.System['readDirectory']> = [path.resolve(args[0]),
        args[1] && [...args[1]], args[2] && [...args[2]], args[3] && [...args[3]], args[4]];
      const key = JSON.stringify(query);
      let value = globs.get(key);
      if (!value) {
        value = { args: query, files: read(...query).filter(file => !excluded(file)).sort(), read };
        globs.set(key, value);
      }
      return [...value.files];
    },
    readBytes,
    readDataBytes(file: string) {
      assertOpen();
      included.add(path.resolve(file));
      const value = readBytes(file);
      const node = input(file, 'file');
      if (node?.kind === 'directory') captureDataStats(node.physical);
      return value;
    },
    ancestors,
    readMetadata(kind: CompilerMetadataKind, file: string, args: readonly unknown[]) {
      assertOpen();
      file = path.resolve(file);
      observe?.(file, 'file');
      const key = JSON.stringify([kind, file, args]);
      let entry = metadata.get(key);
      if (!entry) {
        const node = kind === 'stat' ? inputs.get(file) : undefined;
        const stats = node && dataStats.get(node.physical);
        const options = args[0];
        const validOptions = args.length <= 1 && (options == null || (typeof options === 'object' && !Array.isArray(options)
          && ['bigint', 'throwIfNoEntry'].every(key => Reflect.get(options, key) === undefined || typeof Reflect.get(options, key) === 'boolean')));
        const initial = stats && validOptions
          ? { value: options && typeof options === 'object' && Reflect.get(options, 'bigint') ? stats.bigint : stats.normal } : undefined;
        entry = { file, kind, args: args.map(arg => arg && typeof arg === 'object' ? { ...arg } : arg), query: captureCompilerMetadata(kind, file, args, initial) };
        metadata.set(key, entry);
      }
      return entry.query.value();
    },
    readDirectoryData(file: string, options: unknown) {
      assertOpen();
      file = path.resolve(file);
      included.add(file);
      const node = input(file, 'entries');
      const queryOptions = options && typeof options === 'object'
        ? Object.fromEntries(['encoding', 'withFileTypes', 'recursive']
          .filter(key => Object.prototype.propertyIsEnumerable.call(options, key))
          .map(key => [key, (options as Record<string, unknown>)[key]])) : options;
      const key = JSON.stringify([file, queryOptions]);
      let query = directoryQueries.get(key);
      if (!query) {
        // A new representation must agree with earlier observations before joining this view.
        // Cached identical queries still serve their owned result through transient live edits.
        const contains = (parent: string, child: string) => {
          const relative = path.relative(parent, child);
          return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
        };
        const recursive = (options: unknown) => options && typeof options === 'object' && 'recursive' in options && options.recursive === true;
        for (const previous of directoryQueries.values()) {
          const physical = node?.physical ?? file;
          if (previous.physical !== physical
            && !(recursive(previous.options) && contains(previous.physical, physical))
            && !(recursive(queryOptions) && contains(physical, previous.physical))) continue;
          const current = Reflect.apply(fs.readdirSync, fs, [previous.file, previous.options]) as CompilerDirectoryResult;
          if (directoryResultKey(current) !== previous.key) changed(previous.file);
        }
        if (node) {
          const previous = directories.get(node.physical);
          if (previous && JSON.stringify(entries(previous.file, node.physical)) !== JSON.stringify(previous.entries)) changed(file);
        }
        const result = Reflect.apply(fs.readdirSync, fs, [file, queryOptions]) as CompilerDirectoryResult;
        query = { file, physical: node?.physical ?? file, options: queryOptions, result: copyDirectoryResult(result), key: directoryResultKey(result) };
        directoryQueries.set(key, query);
      }
      return copyDirectoryResult(query.result);
    },
    openDirectoryData(file: string, options: unknown) {
      assertOpen();
      file = path.resolve(file);
      included.add(file);
      input(file, 'entries');
      const capturedOptions = options && typeof options === 'object' ? { ...options } : options;
      const key = JSON.stringify([file, capturedOptions]);
      let query = directoryCursors.get(key);
      if (!query) {
        query = { file, options: capturedOptions, cursor: captureNativeDirectory(file, capturedOptions) };
        directoryCursors.set(key, query);
      }
      return query.cursor;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors: unknown[] = [];
      for (const { cursor } of directoryCursors.values()) {
        try { cursor.dispose(); } catch (error) { errors.push(error); }
      }
      for (const state of [physical, inputs, contents, dataStats, directories, globs, included, metadata, directoryQueries, directoryCursors]) state.clear();
      if (errors.length) throw new AggregateError(errors, 'Could not close compiler directory cursors');
    },
    captureLocation(file: string, kind: BuildInputKind) {
      if (kind === 'entries') listing(file);
      const value = input(file, kind);
      return value && { ...value };
    },
    captureDataLocation(file: string, kind: BuildInputKind) {
      assertOpen();
      included.add(path.resolve(file));
      const value = input(file, kind);
      return value && { ...value };
    },
    resolutionDirectory(file: string) {
      const directory = input(file, 'entries');
      const locations: FileInput[] = directory ? [{ ...directory }] : [];
      const files: Array<{ file: string; bytes?: Buffer; mode: number }> = [];
      for (const entry of listing(file)) {
        const node = input(path.join(file, entry.name), 'file');
        if (!node) continue;
        if (node.kind === 'missing' && entry.kind !== 'link') changed(node.file);
        locations.push({ ...node });
        if (node.kind !== 'file') continue;
        const source = /\.(?:[cm]?[jt]sx?|json)$/.test(node.file);
        files.push({ file: node.physical, mode: node.mode, bytes: source ? readBytes(node.file) : undefined });
      }
      return { files, locations, links: [] };
    },
    /** Admit bytes already consumed by a producer, without rereading its mutable file. */
    captureFile(file: string, value: Buffer) {
      assertOpen();
      included.add(path.resolve(file));
      const node = input(file, 'file');
      const previous = node && contents.get(node.physical);
      if (node?.kind !== 'file' || (contents.has(node.physical) && (previous === undefined || !previous.equals(value)))) {
        throw new Error(`Compiler input changed during capture: ${file}`);
      }
      captureDataStats(node.physical, value);
      contents.set(node.physical, Buffer.from(value));
      return { file: node.physical, bytes: Buffer.from(value), mode: node.mode };
    },
    snapshot() {
      assertOpen();
      // Materialize every positive query and known directory entry, without inventing an ancestor scan.
      for (const value of directories.values()) {
        for (const entry of value.entries) input(path.join(value.file, entry.name), 'file');
      }
      const files = new Map<string, { file: string; bytes: Buffer; mode: number }>();
      for (const value of inputs.values()) {
        if (value.kind !== 'file') continue;
        const data = readBytes(value.file) ?? changed(value.file);
        files.set(value.physical, { file: value.physical, bytes: data, mode: value.mode });
      }
      for (const value of inputs.values()) ancestors(value.file);
      return { files: [...files.values()], locations: [...inputs.values()].map(value => ({ ...value })) };
    },
    assertCurrent() {
      assertOpen();
      const current = new Map<string, string>();
      for (const value of inputs.values()) {
        const next = state(value.file, current);
        if (next.kind !== value.kind || next.physical !== value.physical
          || (value.kind === 'file' && (next.mode & 0o111) !== (value.mode & 0o111))) changed(value.file);
      }
      for (const [file, value] of contents) {
        const next = bytes(file);
        if (value === undefined ? next !== undefined : next === undefined || !value.equals(next)) changed(file);
      }
      for (const [directory, value] of directories) {
        if (JSON.stringify(entries(value.file, directory)) !== JSON.stringify(value.entries)) changed(value.file);
      }
      for (const query of directoryCursors.values()) if (!query.cursor.assertCurrent()) changed(query.file);
      for (const entry of metadata.values()) if (!entry.query.assertCurrent()) changed(entry.file);
      for (const query of directoryQueries.values()) {
        const result = Reflect.apply(fs.readdirSync, fs, [query.file, query.options]) as CompilerDirectoryResult;
        if (directoryResultKey(result) !== query.key) changed(query.file);
      }
      for (const value of globs.values()) {
        if (JSON.stringify(value.read(...value.args).filter(file => !excluded(file)).sort()) !== JSON.stringify(value.files)) changed(value.args[0]);
      }
    },
    observations,
    hash() { return hashCompilerInputObservations(observations()); },
  };
}
