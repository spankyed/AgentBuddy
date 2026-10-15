import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compilerModuleInputsHash } from './compiler-module-inputs.ts';
import type { CompilerInputKind } from './compiler-configuration.ts';

export type CompilerWatchPaths = ReadonlyMap<string, CompilerInputKind>;
const priority = { directory: 0, file: 1, entries: 2 };

function addPath(paths: Map<string, CompilerInputKind>, file: string, kind: CompilerInputKind): void {
  const previous = paths.get(file);
  if (!previous || priority[kind] > priority[previous]) paths.set(file, kind);
}

export function mergeCompilerWatchPaths(before: CompilerWatchPaths, next: CompilerWatchPaths): CompilerWatchPaths {
  const paths = new Map(before);
  for (const [file, kind] of next) addPath(paths, file, kind);
  return paths;
}

function isDirectory(file: string): boolean {
  try { return fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() ?? false; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') return false;
    throw error;
  }
}

/** Fresh resolution probes include absent candidates, so creating a previously missing input can recover a build. */
export function compilerWatchPaths(root: string): { paths: CompilerWatchPaths; complete: boolean; signature: string } {
  const paths = new Map<string, CompilerInputKind>();
  const physical = new Map<string, string>();
  const physicalPath = (file: string): string => {
    const known = physical.get(file);
    if (known) return known;
    let resolved: string;
    try { resolved = fs.realpathSync.native(file); }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      const parent = path.dirname(file);
      if (parent === file) throw error;
      let link: fs.Stats | undefined;
      try { link = fs.lstatSync(file, { throwIfNoEntry: false }); }
      catch (failure) { if ((failure as NodeJS.ErrnoException).code !== 'ENOTDIR') throw failure; }
      resolved = link?.isSymbolicLink() ? physicalPath(path.resolve(parent, fs.readlinkSync(file)))
        : path.join(physicalPath(parent), path.basename(file));
    }
    physical.set(file, resolved);
    return resolved;
  };
  try {
    const hash = compilerModuleInputsHash(root, (file, kind) => {
      const absolute = path.resolve(file);
      const relative = path.relative(root, absolute);
      // The authored root already has a recursive watcher with output exclusions.
      const inside = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      if (inside && !relative.split(path.sep).includes('node_modules')) return;
      addPath(paths, absolute, kind);
      addPath(paths, physicalPath(absolute), kind);
    });
    return { paths, complete: true, signature: `valid:${hash}` };
  } catch {
    // The normal CLI build reports the refusal. Keep partial probes and the previous subscriptions for repair.
    const hash = createHash('sha256');
    for (const [file, kind] of [...paths].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      hash.update(JSON.stringify([file, kind]));
      if (kind !== 'file') continue;
      try { hash.update(fs.readFileSync(file)); }
      catch (error) { hash.update(String((error as NodeJS.ErrnoException).code)); }
    }
    return { paths, complete: false, signature: `invalid:${hash.digest('hex')}` };
  }
}

export interface CompilerWatchTarget {
  paths: Map<string, CompilerInputKind>;
  recursive: boolean;
}

/** Package scopes share recursive subscriptions; filesystem ancestors remain nonrecursive replacement guards. */
export function compilerWatchTargets(paths: CompilerWatchPaths, authoredRoot?: string, platform: NodeJS.Platform = process.platform): Map<string, CompilerWatchTarget> {
  const authoredRoots = authoredRoot === undefined ? [] : [path.resolve(authoredRoot), fs.realpathSync(authoredRoot)];
  const roots = new Set<string>();
  // Linux emulates recursive watches per directory; avoid traversing a whole dependency install there.
  for (const file of platform === 'darwin' || platform === 'win32' ? paths.keys() : []) {
    const parts = file.split(path.sep);
    const modules = parts.indexOf('node_modules');
    if (modules >= 0) {
      const root = parts.slice(0, modules + 1).join(path.sep);
      if (isDirectory(root)) { roots.add(root); roots.add(fs.realpathSync(root)); }
    }
    if (path.basename(file) !== 'package.json') continue;
    try {
      const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!metadata.workspaces) {
        roots.add(path.dirname(file));
        roots.add(fs.realpathSync(path.dirname(file)));
      }
    } catch {
      // Compression is optional: an unreadable manifest keeps its ordinary file/parent subscriptions.
    }
  }
  const scopes = [...roots].filter(scope => path.dirname(scope) !== scope
    && !authoredRoots.some(root => root === scope || root.startsWith(`${scope}${path.sep}`)))
    .sort((a, b) => a.length - b.length);
  const targets = new Map<string, CompilerWatchTarget>();
  const add = (directory: string, file: string, kind: CompilerInputKind) => {
    const scope = scopes.find(root => directory === root || directory.startsWith(`${root}${path.sep}`));
    const anchor = scope ?? directory;
    const target = targets.get(anchor) ?? { paths: new Map<string, CompilerInputKind>(), recursive: scope !== undefined };
    addPath(target.paths, file, kind);
    targets.set(anchor, target);
  };
  for (const [file, kind] of paths) {
    if (authoredRoots.some(root => {
      const relative = path.relative(root, file);
      return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    })) continue;
    let directory = path.dirname(file);
    while (!isDirectory(directory)) {
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error(`No existing directory for compiler input ${file}`);
      directory = parent;
    }
    add(directory, file, kind);
    // A watch stays on its old inode after replacement; subscribe to each ancestor's own replacement too.
    for (let child = directory; path.dirname(child) !== child; child = path.dirname(child)) {
      add(path.dirname(child), child, 'directory');
    }
    if (kind === 'entries' && isDirectory(file)) add(file, file, kind);
  }
  return targets;
}

export function compilerWatchMatches(paths: CompilerWatchPaths, changed: string, event: string): boolean {
  for (const [file, kind] of paths) {
    if (file === changed && (kind !== 'directory' || event === 'rename')) return true;
    if (event === 'rename' && file.startsWith(`${changed}${path.sep}`)) return true;
    if (kind === 'entries' && event === 'rename' && path.dirname(changed) === file) return true;
  }
  return false;
}
