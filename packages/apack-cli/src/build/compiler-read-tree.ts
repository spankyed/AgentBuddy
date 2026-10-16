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

export interface CompilerReadSnapshot {
  readonly files: ReadonlyArray<{ file: string; bytes: Buffer; mode: number }>;
  readonly locations: ReadonlyArray<{ file: string; physical: string; kind: string; slot?: string }>;
  readonly links: ReadonlyArray<{ file: string; target: string }>;
}

/** One build's owned filesystem. Read locations are private; identities remain source paths. */
export function createCompilerReadTree(snapshot: CompilerReadSnapshot, paths: readonly CompilerPathMapping[]) {
  const parent = process.env[BUILD_INPUTS_DIRECTORY_ENV] ?? os.tmpdir();
  if (!path.isAbsolute(parent)) throw new Error('Compiler input workspace must be absolute');
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(parent, 'apack-inputs-')));
  const roots = new Map<string, string>();
  const directories = new Set([directory]);
  const mkdir = (file: string) => {
    fs.mkdirSync(file, { recursive: true });
    for (let current = file; !directories.has(current); current = path.dirname(current)) directories.add(current);
  };
  const dispose = () => removeCompilerReadTree(directory);
  const ownedPath = (file: string) => {
    const source = compilerSourcePath(path.resolve(file), paths);
    const root = path.parse(source).root;
    const target = path.join(directory, Buffer.from(root).toString('hex'));
    roots.set(root, target);
    return path.join(target, path.relative(root, source));
  };
  const sourcePath = (file: string) => compilerSourcePath(file,
    [...roots].map(([source, captured]) => ({ source, captured })));
  try {
    const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    const files = new Map<string, { hash: string; mode: number }>();
    for (const file of snapshot.files) {
      const target = ownedPath(file.file);
      const hash = digest(file.bytes);
      const previous = files.get(target);
      if (previous) {
        if (previous.hash !== hash || (previous.mode & 0o111) !== (file.mode & 0o111)) {
          throw new Error(`Conflicting captured input bytes or mode: ${sourcePath(target)}`);
        }
        continue;
      }
      mkdir(path.dirname(target));
      fs.writeFileSync(target, file.bytes, { flag: 'wx', mode: file.mode & ~0o222 });
      fs.chmodSync(target, file.mode & ~0o222);
      files.set(target, { hash, mode: file.mode });
    }
    for (const location of snapshot.locations) {
      if (location.kind === 'directory') mkdir(ownedPath(location.physical));
    }
    const links = new Map<string, string>();
    const link = (file: string, target: string) => {
      const from = ownedPath(file), to = ownedPath(target);
      if (from === to) return;
      const previous = links.get(from);
      if (previous && previous !== to) throw new Error(`Conflicting captured input binding: ${file}`);
      links.set(from, to);
    };
    for (const location of snapshot.locations) {
      if (location.kind !== 'missing' || location.slot !== location.physical) link(location.file, location.physical);
    }
    for (const binding of snapshot.links) link(binding.file, binding.target);
    for (const [file, target] of [...links].sort(([a], [b]) => a.length - b.length)) {
      mkdir(path.dirname(file));
      const existing = fs.lstatSync(file, { throwIfNoEntry: false });
      if (existing) {
        if (existing.isSymbolicLink() && path.resolve(path.dirname(file), fs.readlinkSync(file)) === target) continue;
        if (fs.realpathSync(file) === fs.realpathSync(target)) continue;
        throw new Error(`Conflicting captured input path: ${sourcePath(file)}`);
      }
      fs.symlinkSync(target, file, process.platform === 'win32'
        ? fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() ? 'junction' : 'file' : undefined);
    }
    for (const location of snapshot.locations) {
      const file = ownedPath(location.file);
      let stat: fs.Stats | undefined;
      try { stat = fs.statSync(file, { throwIfNoEntry: false }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error; }
      if (location.kind === 'missing' ? !!stat : location.kind === 'file' ? !stat?.isFile() : location.kind === 'directory' ? !stat?.isDirectory() : true) {
        throw new Error(`Captured input namespace differs: ${location.file}`);
      }
    }
    const workDirectory = path.join(directory, 'work');
    fs.mkdirSync(workDirectory, { mode: 0o700 });
    for (const file of directories) fs.chmodSync(file, 0o555);
    const entries = new Map([...directories].map(file => [file, fs.readdirSync(file).sort()]));
    const assertCurrent = () => {
      for (const [file, expected] of files) {
        const mode = fs.statSync(file).mode;
        if (digest(fs.readFileSync(file)) !== expected.hash || (mode & 0o111) !== (expected.mode & 0o111) || (mode & 0o222)) {
          throw new Error(`Captured compiler input changed: ${sourcePath(file)}`);
        }
      }
      for (const [file, target] of links) {
        const stat = fs.lstatSync(file, { throwIfNoEntry: false });
        if (stat?.isSymbolicLink() && path.resolve(path.dirname(file), fs.readlinkSync(file)) === target) continue;
        if (stat && fs.realpathSync(file) === fs.realpathSync(target)) continue;
        throw new Error(`Captured compiler binding changed: ${sourcePath(file)}`);
      }
      for (const [file, names] of entries) {
        if ((fs.statSync(file).mode & 0o222) || JSON.stringify(fs.readdirSync(file).sort()) !== JSON.stringify(names)) {
          throw new Error(`Captured compiler namespace changed: ${sourcePath(file)}`);
        }
      }
    };
    assertCurrent();
    return {
      directory,
      workDirectory,
      path: ownedPath,
      sourcePath,
      assertCurrent,
      diagnostic(message: string) {
        for (const [source, captured] of roots) {
          message = message.split(path.relative(process.cwd(), captured) + path.sep).join(source);
          message = message.split(captured + path.sep).join(source);
        }
        return message;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export type CompilerReadTree = ReturnType<typeof createCompilerReadTree>;
