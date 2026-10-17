import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readCompilerModuleInputs } from './compiler-module-inputs.ts';
import { readPackageInputs } from '@apackdev/host/build/package-inputs';
import { physicalWatchPath } from './watch-paths.ts';
import { compilerPackageDirectory, readEsbuildOverride } from './compiler-installation.ts';
import { readCompilerRuntimeInputs } from './compiler-runtime.ts';
import { compilerEnvironmentIdentity } from './compiler-environment.ts';
import type { BuildInputKind, BuildInputObserver } from '@apackdev/host/build/pack-inputs';

export type CompilerWatchPaths = ReadonlyMap<string, BuildInputKind>;
const priority = { directory: 0, file: 1, entries: 2 };

function addPath(paths: Map<string, BuildInputKind>, file: string, kind: BuildInputKind): void {
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

interface CompilerWatchTools {
  read(observe: BuildInputObserver): { paths: CompilerWatchPaths; signature: string };
  changed(file: string | undefined, event: string): void;
}

function readCompilerWatchTools(root: string, observer?: BuildInputObserver) {
  const paths = new Map<string, BuildInputKind>();
  const observe: BuildInputObserver = (file, kind) => {
    addPath(paths, path.resolve(file), kind);
    observer?.(file, kind);
  };
  const tools = readPackageInputs([{ id: 'compiler', directory: compilerPackageDirectory(), contents: true }], { observe }).hash;
  observe(process.execPath, 'file');
  const runtime = readCompilerRuntimeInputs(process.execPath, !!process.versions.electron, file => observe(file.source, 'file'));
  for (const directory of runtime.directories) observe(directory, 'entries');
  for (const { source, target } of runtime.links) { observe(source, 'file'); observe(target, 'file'); }
  const override = readEsbuildOverride({ cwd: root });
  const tooling = createHash('sha256').update(tools).update(runtime.hash).update(compilerEnvironmentIdentity());
  if (override) {
    observe(override.file, 'file');
    tooling.update(JSON.stringify([override.file, override.kind]));
    if (override.kind === 'file') {
      observe(override.source, 'file');
      tooling.update(JSON.stringify([override.source, override.mode & 0o111])).update(override.bytes);
    }
  }
  return { paths, signature: tooling.digest('hex') };
}

/** Subscription discovery is reusable until a tooling event; builds independently verify compiler bytes. */
export function createCompilerWatchTools(root: string): CompilerWatchTools {
  let cached: ReturnType<typeof readCompilerWatchTools> | undefined;
  let matches = createCompilerWatchMatcher(new Map());
  let environment: string | undefined;
  return {
    read(observe) {
      const current = compilerEnvironmentIdentity();
      if (!cached || environment !== current) {
        cached = readCompilerWatchTools(root, observe);
        const physical = new Map<string, string>();
        for (const [file, kind] of cached.paths) addPath(cached.paths, physicalWatchPath(file, physical), kind);
        matches = createCompilerWatchMatcher(cached.paths);
        environment = current;
      }
      return cached;
    },
    changed(file, event) {
      if (file === undefined || matches(path.resolve(file), event)) cached = undefined;
    },
  };
}

/** Fresh resolution probes include absent candidates, so creating a previously missing input can recover a build. */
export function compilerWatchPaths(root: string, tools?: CompilerWatchTools): { paths: CompilerWatchPaths; complete: boolean; signature: string } {
  const paths = new Map<string, BuildInputKind>();
  const physical = new Map<string, string>();
  const physicalPath = (file: string) => physicalWatchPath(file, physical);

  try {
    const observe: BuildInputObserver = (file, kind) => {
      const absolute = path.resolve(file);
      const relative = path.relative(root, absolute);
      // The authored root already has a recursive watcher with output exclusions.
      const inside = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      if (inside && !relative.split(path.sep).includes('node_modules')) return;
      addPath(paths, absolute, kind);
      addPath(paths, physicalPath(absolute), kind);
    };
    const tooling = tools?.read(observe) ?? readCompilerWatchTools(root, observe);
    for (const [file, kind] of tooling.paths) addPath(paths, file, kind);
    const modules = readCompilerModuleInputs(root, observe);
    try {
      const packages = readPackageInputs([{ id: 'pack', directory: root, development: true }], { discovered: modules.packageDirectories, observe }).hash;
      return { paths, complete: true, signature: `valid:${modules.hash}:${packages}:${tooling.signature}` };
    } finally { modules.dispose(); }
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
  paths: Map<string, BuildInputKind>;
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
      if (!roots.has(root) && isDirectory(root)) { roots.add(root); roots.add(fs.realpathSync(root)); }
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
  const scopeFor = new Map<string, string | undefined>();
  const add = (directory: string, file: string, kind: BuildInputKind) => {
    if (!scopeFor.has(directory)) scopeFor.set(directory, scopes.find(root => directory === root || directory.startsWith(`${root}${path.sep}`)));
    const scope = scopeFor.get(directory);
    const anchor = scope ?? directory;
    const target = targets.get(anchor) ?? { paths: new Map<string, BuildInputKind>(), recursive: scope !== undefined };
    addPath(target.paths, file, kind);
    targets.set(anchor, target);
  };
  const guarded = new Set<string>();
  const directories = new Map<string, boolean>();
  const directoryExists = (directory: string) => {
    if (!directories.has(directory)) directories.set(directory, isDirectory(directory));
    return directories.get(directory)!;
  };
  for (const [file, kind] of paths) {
    if (authoredRoots.some(root => {
      const relative = path.relative(root, file);
      return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    })) continue;
    let directory = path.dirname(file);
    while (!directoryExists(directory)) {
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error(`No existing directory for compiler input ${file}`);
      directory = parent;
    }
    add(directory, file, kind);
    // A watch stays on its old inode after replacement; subscribe to each ancestor's own replacement too.
    for (let child = directory; path.dirname(child) !== child && !guarded.has(child); child = path.dirname(child)) {
      guarded.add(child);
      add(path.dirname(child), child, 'directory');
    }
    if (kind === 'entries' && directoryExists(file)) add(file, file, kind);
  }
  return targets;
}

/** One matcher per subscription: replacements include ancestors, membership includes immediate children. */
export function createCompilerWatchMatcher(paths: CompilerWatchPaths): (changed: string, event: string) => boolean {
  const ancestors = new Set<string>();
  for (const file of paths.keys()) {
    for (let parent = path.dirname(file); !ancestors.has(parent); parent = path.dirname(parent)) {
      ancestors.add(parent);
      if (parent === path.dirname(parent)) break;
    }
  }
  return (changed, event) => {
    const kind = paths.get(changed);
    if (event !== 'rename') return kind !== undefined && kind !== 'directory';
    return kind !== undefined || ancestors.has(changed) || paths.get(path.dirname(changed)) === 'entries';
  };
}
