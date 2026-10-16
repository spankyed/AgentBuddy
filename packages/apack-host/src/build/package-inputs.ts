import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { BuildInputObserver } from './pack-inputs.ts';

export interface PackageInputOwner {
  readonly id: string;
  readonly directory: string;
  readonly development?: boolean;
  /** Consumers normally hash their authored files separately; compiler installations include them. */
  readonly contents?: boolean;
}

export interface PackageInputFile {
  readonly path: string;
  readonly source: string;
  readonly mode: number;
  readonly hash: string;
}

export interface PackageInputLink {
  readonly path: string;
  readonly target: string;
}

export interface PackageInputNode {
  readonly directory: string;
  readonly metadata: string | null;
  readonly files: PackageInputFile[];
  readonly directories: Array<{ path: string; source: string }>;
  readonly links: PackageInputLink[];
  readonly dependencies: Record<string, number | null>;
  /** Original Node lookup locations, including linked workspace packages. */
  readonly lookups: Record<string, string>;
}

export interface PackageInputs {
  readonly hash: string;
  readonly roots: ReadonlyArray<{ id: string; node: number }>;
  readonly imported: readonly number[];
  readonly nodes: readonly PackageInputNode[];
}

interface PackageInputOptions {
  readonly discovered?: readonly string[];
  readonly observe?: BuildInputObserver;
  /** Bytes used by this capture's identity; copying must not reread the live file. */
  readonly onFile?: (file: PackageInputFile, bytes: Buffer) => void;
}

/** Resolve package ownership without executing an entry or requiring package.json to be exported. */
function dependencyDirectory(owner: string, name: string, observe?: BuildInputObserver): { directory: string; lookup: string } | undefined {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) || name.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`Invalid npm dependency name: ${name}`);
  }
  for (const directory of createRequire(path.join(owner, 'package.json')).resolve.paths(name) ?? []) {
    const candidate = path.join(directory, name);
    observe?.(path.join(candidate, 'package.json'), 'file');
    if (fs.statSync(path.join(candidate, 'package.json'), { throwIfNoEntry: false })?.isFile()) {
      return { directory: fs.realpathSync(candidate), lookup: candidate };
    }
  }
}

function readPackageFiles(node: PackageInputNode, targets: readonly string[], owners: ReadonlyMap<string, unknown>, { observe, onFile }: PackageInputOptions): void {
  const root = node.directory;
  const ancestors = new Set<string>();
  const files = new Map<string, { source: string; mode?: number }>();
  function walk(file: string, entry?: fs.Dirent, parent?: string): void {
    observe?.(file, 'file');
    const link = entry?.isSymbolicLink() ?? fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink();
    const stat = entry && !link ? entry : fs.statSync(file, { throwIfNoEntry: false });
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (link) {
      node.links.push({ path: relative, target: stat ? fs.realpathSync(file) : path.resolve(path.dirname(file), fs.readlinkSync(file)) });
    }
    if (!stat) return;
    if (stat.isFile()) {
      files.set(relative, {
        source: entry && !link && parent ? path.join(parent, entry.name) : fs.realpathSync(file),
        mode: 'mode' in stat ? stat.mode & 0o777 : undefined,
      });
      return;
    }
    if (!stat.isDirectory()) throw new Error(`Unsupported package input: ${file}`);
    const real = fs.realpathSync(file);
    if (file !== root && owners.has(real)) return;
    if (ancestors.has(real)) throw new Error(`Cyclic package input: ${file}`);
    ancestors.add(real);
    node.directories.push({ path: relative, source: real });
    observe?.(file, 'entries');
    for (const child of fs.readdirSync(file, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (['node_modules', '.git', '.temp', '.apack', '.cache'].includes(child.name)) continue;
      walk(path.join(file, child.name), child, real);
    }
    ancestors.delete(real);
  }
  for (const target of targets) walk(path.join(root, target));
  for (const [file, physical] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const { source } = physical;
    const mode = physical.mode ?? (fs.statSync(source).mode & 0o777);
    const bytes = fs.readFileSync(source);
    const input = { path: file, source, mode, hash: createHash('sha256').update(bytes).digest('hex') };
    node.files.push(input);
    onFile?.(input, bytes);
  }
  node.directories.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  node.links.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Workspace export roots include source and published code; installed packages include all shipped files. */
function packageTargets(manifest: Record<string, unknown>): string[] {
  const workspace = JSON.stringify(manifest.exports ?? {}).includes('"@apackdev/source"')
    || (manifest.private === true && typeof manifest.name === 'string' && manifest.name.startsWith('@apackdev/'));
  if (!workspace) return ['.'];
  const targets = new Set(['package.json']);
  const prefixOf = (target: string) => {
    if (path.isAbsolute(target) || target.split(/[\\/]/).includes('..')) throw new Error(`Package files escape its owner: ${target}`);
    return target.replace(/^\.\//, '').split('/')[0]!;
  };
  function exports(node: unknown): void {
    if (typeof node === 'string' && node.startsWith('./')) targets.add(prefixOf(node));
    else if (Array.isArray(node)) node.forEach(exports);
    else if (node && typeof node === 'object') Object.values(node).forEach(exports);
  }
  exports(manifest.exports);
  for (const target of Array.isArray(manifest.files) ? manifest.files : []) {
    if (typeof target !== 'string') throw new Error('Package files entries must be strings');
    const prefix = prefixOf(target);
    if (/[*!?{}]/.test(prefix)) return ['.'];
    targets.add(prefix);
  }
  return [...targets].sort();
}

/** Declared and compiler-discovered package scopes, including their transitive resolution edges. */
export function readPackageInputs(owners: readonly PackageInputOwner[], options: PackageInputOptions = {}): PackageInputs {
  const { discovered = [], observe, onFile } = options;
  const seen = new Map<string, number>();
  const rootInputs = new Map<string, { development: boolean; contents: boolean }>();
  for (const owner of owners) {
    const root = fs.realpathSync(owner.directory);
    const previous = rootInputs.get(root);
    rootInputs.set(root, { development: previous?.development || !!owner.development, contents: previous?.contents || !!owner.contents });
  }
  const nodes: PackageInputNode[] = [];
  function register(directory: string, contents: boolean): number {
    const root = fs.realpathSync(directory);
    const existing = seen.get(root);
    if (existing !== undefined) return existing;
    const index = nodes.length;
    seen.set(root, index);
    const file = path.join(root, 'package.json');
    observe?.(file, 'file');
    const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
    const metadata = bytes?.toString('utf8') ?? null;
    const manifest = metadata ? JSON.parse(metadata) : {};
    const node: PackageInputNode = { directory: root, metadata, files: [], directories: [], links: [],
      dependencies: Object.create(null), lookups: Object.create(null) };
    nodes.push(node);
    if (bytes && onFile) onFile({ path: 'package.json', source: fs.realpathSync(file), mode: fs.statSync(file).mode & 0o777,
      hash: createHash('sha256').update(bytes).digest('hex') }, bytes);
    if (contents) readPackageFiles(node, packageTargets(manifest), rootInputs, options);
    return index;
  }
  const populated = new Set<number>();
  function populate(index: number, development: boolean): void {
    if (populated.has(index)) return;
    populated.add(index);
    const node = nodes[index]!;
    development = rootInputs.get(node.directory)?.development ?? development;
    const manifest = node.metadata ? JSON.parse(node.metadata) : {};
    const names = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies,
      ...manifest.optionalDependencies, ...(development && manifest.devDependencies) }).sort();
    for (const name of names) {
      const dependency = dependencyDirectory(node.directory, name, observe);
      if (!dependency) { node.dependencies[name] = null; continue; }
      const child = register(dependency.directory, true);
      node.dependencies[name] = child;
      node.lookups[name] = dependency.lookup;
      populate(child, false);
    }
  }
  // Consumer roots normally have their own authored scope. Pre-register roots so cycles cannot
  // accidentally include their build output in their own input key.
  const roots = owners.map(owner => ({ id: owner.id, node: register(owner.directory, rootInputs.get(fs.realpathSync(owner.directory))!.contents) }));
  owners.forEach((owner, index) => populate(roots[index]!.node, owner.development ?? false));
  const imported = discovered.map(directory => {
    const index = register(directory, true);
    populate(index, false);
    return index;
  });
  const identity = nodes.map(node => ({
    metadata: node.metadata,
    files: node.files.map(file => [file.path, file.hash, file.mode & 0o111, path.relative(node.directory, file.source)]),
    directories: node.directories.map(directory => [directory.path, path.relative(node.directory, directory.source)]),
    links: node.links.map(link => [link.path, path.relative(node.directory, link.target)]),
    dependencies: node.dependencies,
  }));
  return { hash: createHash('sha256').update(JSON.stringify({ roots, imported, nodes: identity })).digest('hex'), roots, imported, nodes };
}
