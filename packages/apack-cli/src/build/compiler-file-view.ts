import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import type { BuildInputKind, BuildInputObserver } from '@apackdev/host/build/pack-inputs';
import { compilerSourcePath, type CompilerPathMapping } from './compiler-paths.ts';
import { physicalWatchPath } from './watch-paths.ts';

export type CompilerFileSystem = Pick<ts.System,
  'readFile' | 'fileExists' | 'directoryExists' | 'getDirectories' | 'readDirectory'> & { realpath(file: string): string };

interface FileState {
  physical: string;
  kind: 'file' | 'directory' | 'missing' | 'other';
}

interface FileInput extends FileState { file: string; slot: string }
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
  const origin = fs.realpathSync(root);
  const excluded = options.excluded ?? (() => false);
  const paths = options.paths?.map(mapping => ({ ...mapping })) ?? [];
  const observe = options.observe;
  const relative = (file: string) => path.relative(origin, compilerSourcePath(file, paths)).split(path.sep).join('/');
  const physical = new Map<string, string>();
  const inputs = new Map<string, FileInput>();
  const contents = new Map<string, Buffer | undefined>();
  const directories = new Map<string, { file: string; entries: DirectoryEntry[] }>();
  const globs = new Map<string, { args: Parameters<ts.System['readDirectory']>; files: string[] }>();

  function state(file: string, paths: Map<string, string>): FileState {
    const target = physicalWatchPath(file, paths);
    let stat: fs.Stats | undefined;
    try { stat = fs.statSync(target, { throwIfNoEntry: false }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error; }
    return { physical: target, kind: stat?.isFile() ? 'file' : stat?.isDirectory() ? 'directory' : stat ? 'other' : 'missing' };
  }

  function input(file: string, kind: BuildInputKind): FileInput | undefined {
    file = path.resolve(file);
    observe?.(file, kind);
    if (excluded(file)) return;
    let value = inputs.get(file);
    if (!value) {
      value = { file, ...state(file, physical), slot: path.join(physicalWatchPath(path.dirname(file), physical), path.basename(file)) };
      inputs.set(file, value);
    }
    return value;
  }

  const bytes = (file: string): Buffer | undefined => {
    try { return fs.readFileSync(file); }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
  };
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

  const fileSystem: CompilerFileSystem = {
    readFile(file) {
      const node = input(file, 'file');
      if (node?.kind !== 'file') return;
      if (!contents.has(node.physical)) contents.set(node.physical, bytes(node.physical));
      const value = contents.get(node.physical);
      return value === undefined ? undefined : sourceText(value);
    },
    fileExists: file => input(file, 'file')?.kind === 'file',
    directoryExists: file => input(file, 'directory')?.kind === 'directory',
    getDirectories(file) {
      return listing(file).filter(entry => entry.kind === 'directory'
        || (entry.kind === 'link' && fileSystem.directoryExists(path.join(file, entry.name)))).map(entry => entry.name);
    },
    realpath: file => input(file, 'file')?.physical ?? path.resolve(file),
    readDirectory(...args) {
      if (input(args[0], 'entries')?.kind !== 'directory') return [];
      const query: Parameters<ts.System['readDirectory']> = [path.resolve(args[0]),
        args[1] && [...args[1]], args[2] && [...args[2]], args[3] && [...args[3]], args[4]];
      const key = JSON.stringify(query);
      let value = globs.get(key);
      if (!value) {
        value = { args: query, files: ts.sys.readDirectory(...query).filter(file => !excluded(file)).sort() };
        globs.set(key, value);
      }
      return [...value.files];
    },
  };

  input(root, 'directory');
  const changed = (file: string): never => { throw new Error(`Compiler resolution namespace changed during discovery: ${file}`); };
  return {
    fileSystem,
    assertCurrent() {
      const current = new Map<string, string>();
      for (const value of inputs.values()) {
        const next = state(value.file, current);
        if (next.kind !== value.kind || next.physical !== value.physical) changed(value.file);
      }
      for (const [file, value] of contents) {
        const next = bytes(file);
        if (value === undefined ? next !== undefined : next === undefined || !value.equals(next)) changed(file);
      }
      for (const [directory, value] of directories) {
        if (JSON.stringify(entries(value.file, directory)) !== JSON.stringify(value.entries)) changed(value.file);
      }
      for (const value of globs.values()) {
        if (JSON.stringify(ts.sys.readDirectory(...value.args).filter(file => !excluded(file)).sort()) !== JSON.stringify(value.files)) changed(value.args[0]);
      }
    },
    hash() {
      const hash = createHash('sha256');
      const files = new Map<string, Buffer | undefined>();
      for (const [file, value] of contents) {
        const name = relative(file);
        if (files.has(name)) {
          const previous = files.get(name);
          if (previous === undefined ? value !== undefined : value === undefined || !previous.equals(value)) {
            throw new Error(`Compiler input differs between captured and live sources: ${name}`);
          }
        }
        files.set(name, value);
      }
      for (const [file, value] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        hash.update(JSON.stringify(['file', file, value === undefined ? null : createHash('sha256').update(value).digest('hex')]));
      }
      const namespaces = new Map<string, string>();
      for (const value of inputs.values()) {
        const key = relative(value.slot), data = JSON.stringify([relative(value.physical), value.kind]);
        if (namespaces.has(key) && namespaces.get(key) !== data) changed(value.file);
        namespaces.set(key, data);
      }
      for (const entry of [...namespaces].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) hash.update(JSON.stringify(['namespace', ...entry]));
      const listings = new Map<string, string>();
      for (const [directory, value] of directories) {
        const key = relative(directory), data = JSON.stringify(value.entries);
        if (listings.has(key) && listings.get(key) !== data) changed(value.file);
        listings.set(key, data);
      }
      for (const entry of [...listings].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) hash.update(JSON.stringify(['entries', ...entry]));
      const searches = new Map<string, string>();
      for (const value of globs.values()) {
        const relativePattern = (pattern: string) => path.isAbsolute(pattern) ? path.relative(value.args[0], pattern).split(path.sep).join('/') : pattern;
        const patterns = value.args.slice(1).map(arg => Array.isArray(arg) ? arg.map(relativePattern) : arg);
        const key = JSON.stringify([relative(physicalWatchPath(value.args[0], physical)), patterns]);
        const data = JSON.stringify(value.files.map(file => path.relative(value.args[0], file).split(path.sep).join('/')));
        if (searches.has(key) && searches.get(key) !== data) changed(value.args[0]);
        searches.set(key, data);
      }
      for (const entry of [...searches].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) hash.update(JSON.stringify(['glob', ...entry]));
      return hash.digest('hex');
    },
  };
}
