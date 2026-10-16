import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compilerSourcePath, type CompilerPathMapping } from './compiler-paths.ts';

export const BUILD_INPUTS_DIRECTORY_ENV = 'APACK_BUILD_INPUTS_DIRECTORY';

/** Remove only the caller-owned directory; never follow aliases while unlocking a dead worker's tree. */
export function removeCompilerReadTree(directory: string): void {
  const unlock = (file: string) => {
    if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isDirectory()) return;
    fs.chmodSync(file, 0o700);
    for (const entry of fs.readdirSync(file, { withFileTypes: true })) {
      if (entry.isDirectory()) unlock(path.join(file, entry.name));
    }
  };
  unlock(directory);
  fs.rmSync(directory, { recursive: true, force: true });
}

interface CompilerReadLocation {
  readonly file: string;
  readonly physical: string;
  readonly kind: string;
  readonly slot?: string;
}

export interface CompilerReadSnapshot {
  readonly files: ReadonlyArray<{ file: string; bytes?: Buffer; mode: number }>;
  readonly locations: readonly CompilerReadLocation[];
  readonly links: ReadonlyArray<{ file: string; target: string }>;
}

type ProjectMetadata = (file: string, bytes: Buffer, readPath: (file: string) => string) => Buffer;

/** Owned queries can admit a new namespace; previously captured source bytes cannot change. */
export function createCompilerReadTree(snapshot: CompilerReadSnapshot, paths: readonly CompilerPathMapping[], projectMetadata?: ProjectMetadata) {
  const parent = process.env[BUILD_INPUTS_DIRECTORY_ENV] ?? os.tmpdir();
  if (!path.isAbsolute(parent)) throw new Error('Compiler input workspace must be absolute');
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(parent, 'apack-inputs-')));
  const roots = new Map<string, string>();
  const dataRoots = new Map<string, string>();
  const directories = new Set([directory]);
  const entries = new Map<string, string[]>();
  const files = new Map<string, { sourceHash?: string; hash: string; mode: number }>();
  const links = new Map<string, string>();
  const locations = new Map<string, CompilerReadLocation>();
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const dispose = () => removeCompilerReadTree(directory);
  const mappings = () => [...roots, ...dataRoots].map(([source, captured]) => ({ source, captured }));
  const sourcePath = (file: string) => compilerSourcePath(compilerSourcePath(file, mappings()), paths);
  const mappedPath = (file: string, roots: Map<string, string>, prefix = directory) => {
    const source = sourcePath(path.resolve(file));
    const root = path.parse(source).root;
    const target = path.join(prefix, Buffer.from(root).toString('hex'));
    roots.set(root, target);
    return path.join(target, path.relative(root, source));
  };
  const ownedPath = (file: string) => mappedPath(file, roots);
  const dataPath = (file: string) => mappedPath(file, dataRoots, path.join(directory, 'data'));
  const names = (file: string) => fs.readdirSync(file).sort();
  const changed = (kind: string, file: string): never => {
    throw new Error(`Captured compiler ${kind} changed: ${sourcePath(file)}`);
  };

  function include(next: CompilerReadSnapshot, readPath = ownedPath, project: ProjectMetadata | null = projectMetadata ?? null) {
    const writable = new Set<string>();
    const pendingLinks = new Map<string, string>();
    const mkdir = (file: string): void => {
      const stat = fs.statSync(file, { throwIfNoEntry: false });
      if (!stat) {
        mkdir(path.dirname(file));
        fs.mkdirSync(file, { mode: 0o700 });
        directories.add(file);
        writable.add(file);
        return;
      }
      const real = fs.realpathSync(file);
      const relative = path.relative(directory, real);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) changed('binding', file);
      if (writable.has(real)) return;
      const expected = entries.get(real);
      if (expected && JSON.stringify(names(real)) !== JSON.stringify(expected)) changed('namespace', file);
      fs.chmodSync(real, 0o700);
      directories.add(real);
      writable.add(real);
    };
    const link = (file: string, target: string) => {
      const from = readPath(file), to = readPath(target);
      if (from === to) return;
      const previous = links.get(from);
      if (previous && previous !== to) throw new Error(`Conflicting captured input binding: ${file}`);
      if (previous) return;
      links.set(from, to);
      pendingLinks.set(from, to);
    };
    try {
      for (const file of next.files) {
        const target = readPath(file.file);
        const previous = files.get(target);
        if (file.bytes === undefined && previous) continue;
        const sourceHash = file.bytes === undefined ? undefined : digest(file.bytes);
        if (previous && ((previous.sourceHash !== undefined && previous.sourceHash !== sourceHash)
          || (previous.mode & 0o111) !== (file.mode & 0o111))) {
          throw new Error(`Conflicting captured input bytes or mode: ${sourcePath(target)}`);
        }
        const bytes = file.bytes === undefined ? Buffer.alloc(0) : project?.(sourcePath(file.file), file.bytes, readPath) ?? file.bytes;
        const hash = digest(bytes);
        if (previous?.hash === hash) {
          if (sourceHash !== undefined) previous.sourceHash = sourceHash;
          continue;
        }
        mkdir(path.dirname(target));
        if (previous) {
          if (digest(fs.readFileSync(target)) !== previous.hash) changed('input', target);
          fs.chmodSync(target, 0o600);
        }
        fs.writeFileSync(target, bytes, { flag: previous ? 'w' : 'wx', mode: file.mode & ~0o222 });
        fs.chmodSync(target, file.mode & ~0o222);
        files.set(target, { sourceHash, hash, mode: file.mode });
      }
      for (const location of next.locations) {
        const file = sourcePath(location.file), physical = sourcePath(location.physical);
        const previous = locations.get(file);
        if (previous && (previous.physical !== physical || previous.kind !== location.kind)) changed('namespace', file);
        locations.set(file, { ...location, file, physical });
        if (location.kind === 'directory') mkdir(readPath(physical));
        if (location.kind !== 'missing' || location.slot !== location.physical) link(file, physical);
      }
      for (const binding of next.links) link(binding.file, binding.target);
      for (const [file, target] of [...pendingLinks].sort(([a], [b]) => a.length - b.length)) {
        const existing = fs.lstatSync(file, { throwIfNoEntry: false });
        if (existing) {
          if (existing.isSymbolicLink() && path.resolve(path.dirname(file), fs.readlinkSync(file)) === target) continue;
          if (fs.realpathSync(file) === fs.realpathSync(target)) continue;
          throw new Error(`Conflicting captured input path: ${sourcePath(file)}`);
        }
        mkdir(path.dirname(file));
        fs.symlinkSync(target, file, process.platform === 'win32'
          ? fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() ? 'junction' : 'file' : undefined);
      }
      for (const location of next.locations) {
        let stat: fs.Stats | undefined;
        try { stat = fs.statSync(readPath(location.file), { throwIfNoEntry: false }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error; }
        if (location.kind === 'missing' ? !!stat : location.kind === 'file' ? !stat?.isFile() : location.kind === 'directory' ? !stat?.isDirectory() : true) {
          throw new Error(`Captured input namespace differs: ${sourcePath(location.file)}`);
        }
      }
    } finally {
      for (const file of writable) {
        fs.chmodSync(file, file === directory ? 0o500 : 0o555);
        entries.set(file, names(file));
      }
    }
  }

  const assertCurrent = () => {
    for (const [file, expected] of files) {
      const mode = fs.statSync(file).mode;
      if (digest(fs.readFileSync(file)) !== expected.hash || (mode & 0o111) !== (expected.mode & 0o111) || (mode & 0o222)) changed('input', file);
    }
    for (const [file, target] of links) {
      const stat = fs.lstatSync(file, { throwIfNoEntry: false });
      if (stat?.isSymbolicLink() && path.resolve(path.dirname(file), fs.readlinkSync(file)) === target) continue;
      if (stat && fs.realpathSync(file) === fs.realpathSync(target)) continue;
      changed('binding', file);
    }
    for (const [file, expected] of entries) {
      if ((fs.statSync(file).mode & 0o222) || JSON.stringify(names(file)) !== JSON.stringify(expected)) changed('namespace', file);
    }
  };
  try {
    const workDirectory = path.join(directory, 'work');
    fs.mkdirSync(workDirectory, { mode: 0o700 });
    // Stop implicit compiler configuration/package scope at the mirrored filesystem boundary.
    for (const [name, text] of Object.entries({ 'tsconfig.json': '{}', 'package.json': '{"type":"commonjs"}' })) {
      const file = path.join(directory, name), bytes = Buffer.from(text), hash = digest(bytes);
      fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o400 });
      files.set(file, { sourceHash: hash, hash, mode: 0o400 });
    }
    include(snapshot);
    // Even an empty snapshot retains a private, owner-only container.
    fs.chmodSync(directory, 0o500);
    entries.set(directory, names(directory));
    assertCurrent();
    return {
      directory, workDirectory, path: ownedPath, sourcePath, include, assertCurrent, dispose,
      dataPath, includeData: (snapshot: CompilerReadSnapshot) => include(snapshot, dataPath, null),
      diagnostic(message: string) {
        for (const [source, captured] of [...roots, ...dataRoots]) {
          const relative = path.relative(process.cwd(), captured);
          if (relative) message = message.split(relative + path.sep).join(source);
          message = message.split(captured + path.sep).join(source);
        }
        return message;
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export type CompilerReadTree = ReturnType<typeof createCompilerReadTree>;
