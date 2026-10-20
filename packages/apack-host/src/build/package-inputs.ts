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
  /** `all` read every package file; `resolution` read only the files resolvers read directly (see `PackageInputOptions`). */
  readonly contents: 'all' | 'resolution' | 'none';
  readonly files: PackageInputFile[];
  /** Package files present but not read, in `resolution` mode: their membership is an input, their bytes are not. */
  readonly unread: string[];
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
  /**
   * How much of each dependency package is read. `all` (the default) reads every file, which a compiler installation
   * copies. `resolution` records membership and reads only the files a resolver consults without going through a
   * compiler's own reads (`package.json`, `tsconfig*.json`, `jsconfig.json`): a pack build captures the rest when a
   * compiler opens it.
   */
  readonly dependencyContents?: 'all' | 'resolution';
  readonly observe?: BuildInputObserver;
  /** Bytes used by this capture's identity; copying must not reread the live file. */
  readonly onFile?: (file: PackageInputFile, bytes: Buffer) => void;
  /** The exact filtered membership used during the package walk. */
  readonly onDirectory?: (directory: string, names: readonly string[]) => void;
}

/** Package inventory ignores tool/cache trees; capture and validation use the same membership. */
export function readPackageDirectoryEntries(directory: string): fs.Dirent[] {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => !['node_modules', '.git', '.temp', '.apack', '.cache'].includes(entry.name))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** Resolve package ownership without executing an entry or requiring package.json to be exported. */
export function findPackageDirectory(owner: string, name: string, observe?: BuildInputObserver): { directory: string; lookup: string } | undefined {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) || name.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`Invalid npm dependency name: ${name}`);
  }
  for (const directory of createRequire(path.join(owner, 'package.json')).resolve.paths(name) ?? []) {
    const candidate = path.join(directory, name);
    observe?.(path.join(candidate, 'package.json'), 'file');
    if (fs.statSync(path.join(candidate, 'package.json'), { throwIfNoEntry: false })?.isFile()) {
      return { directory: fs.realpathSync.native(candidate), lookup: candidate };
    }
  }
}

/** The files esbuild, Vite and TypeScript resolution read directly, outside a compiler's captured reads. */
const resolutionFile = (name: string) => name === 'package.json' || name === 'jsconfig.json' || /^tsconfig.*\.json$/.test(name);

function* readPackageFiles(node: PackageInputNode, targets: readonly string[], owners: ReadonlyMap<string, unknown>, { observe, onFile, onDirectory }: PackageInputOptions): Generator<string, void, Buffer> {
  const root = node.directory;
  const everything = node.contents === 'all';
  const ancestors = new Set<string>();
  const files = new Map<string, { source: string; mode?: number }>();
  function walk(file: string, entry?: fs.Dirent, parent?: string): void {
    const listedOnly = !everything && !!entry?.isFile() && !resolutionFile(entry.name);
    if (listedOnly) {
      node.unread.push(path.relative(root, file).split(path.sep).join('/'));
      return;
    }
    observe?.(file, 'file');
    const link = entry?.isSymbolicLink() ?? fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink();
    const stat = entry && !link ? entry : fs.statSync(file, { throwIfNoEntry: false });
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (link) {
      node.links.push({ path: relative, target: stat ? fs.realpathSync.native(file) : path.resolve(path.dirname(file), fs.readlinkSync(file)) });
    }
    if (!stat) return;
    if (stat.isFile()) {
      files.set(relative, {
        source: entry && !link && parent ? path.join(parent, entry.name) : fs.realpathSync.native(file),
        mode: 'mode' in stat ? stat.mode & 0o777 : undefined,
      });
      return;
    }
    if (!stat.isDirectory()) throw new Error(`Unsupported package input: ${file}`);
    const real = fs.realpathSync.native(file);
    if (file !== root && owners.has(real)) return;
    if (ancestors.has(real)) throw new Error(`Cyclic package input: ${file}`);
    ancestors.add(real);
    node.directories.push({ path: relative, source: real });
    observe?.(file, 'entries');
    const entries = readPackageDirectoryEntries(file);
    onDirectory?.(real, entries.map(entry => entry.name));
    for (const child of entries) {
      walk(path.join(file, child.name), child, real);
    }
    ancestors.delete(real);
  }
  for (const target of targets) walk(path.join(root, target));
  for (const [file, physical] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const { source } = physical;
    const mode = physical.mode ?? (fs.statSync(source).mode & 0o777);
    const bytes = yield source;
    const input = { path: file, source, mode, hash: createHash('sha256').update(bytes).digest('hex') };
    node.files.push(input);
    onFile?.(input, bytes);
  }
  node.unread.sort();
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
function* packageInputReads(owners: readonly PackageInputOwner[], options: PackageInputOptions): Generator<string, PackageInputs, Buffer> {
  const { discovered = [], observe, onFile } = options;
  const dependencyContents = options.dependencyContents ?? 'all';
  const seen = new Map<string, number>();
  const rootInputs = new Map<string, { development: boolean; contents: boolean }>();
  for (const owner of owners) {
    const root = fs.realpathSync.native(owner.directory);
    const previous = rootInputs.get(root);
    rootInputs.set(root, { development: previous?.development || !!owner.development, contents: previous?.contents || !!owner.contents });
  }
  const nodes: PackageInputNode[] = [];
  function* register(directory: string, contents: PackageInputNode['contents']): Generator<string, number, Buffer> {
    const root = fs.realpathSync.native(directory);
    const existing = seen.get(root);
    if (existing !== undefined) return existing;
    const index = nodes.length;
    seen.set(root, index);
    const file = path.join(root, 'package.json');
    observe?.(file, 'file');
    const bytes = fs.existsSync(file) ? (yield file) : null;
    const metadata = bytes?.toString('utf8') ?? null;
    const manifest = metadata ? JSON.parse(metadata) : {};
    const node: PackageInputNode = { directory: root, metadata, contents, files: [], unread: [], directories: [], links: [],
      dependencies: Object.create(null), lookups: Object.create(null) };
    nodes.push(node);
    if (bytes && onFile) onFile({ path: 'package.json', source: fs.realpathSync.native(file), mode: fs.statSync(file).mode & 0o777,
      hash: createHash('sha256').update(bytes).digest('hex') }, bytes);
    if (contents !== 'none') yield* readPackageFiles(node, packageTargets(manifest), rootInputs, options);
    return index;
  }
  const populated = new Set<number>();
  function* populate(index: number, development: boolean): Generator<string, void, Buffer> {
    if (populated.has(index)) return;
    populated.add(index);
    const node = nodes[index]!;
    development = rootInputs.get(node.directory)?.development ?? development;
    const manifest = node.metadata ? JSON.parse(node.metadata) : {};
    const names = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies,
      ...manifest.optionalDependencies, ...(development && manifest.devDependencies) }).sort();
    for (const name of names) {
      const dependency = findPackageDirectory(node.directory, name, observe);
      if (!dependency) { node.dependencies[name] = null; continue; }
      const child = yield* register(dependency.directory, dependencyContents);
      node.dependencies[name] = child;
      node.lookups[name] = dependency.lookup;
      yield* populate(child, false);
    }
  }
  // Consumer roots normally have their own authored scope. Pre-register roots so cycles cannot
  // accidentally include their build output in their own input key.
  const roots: Array<{ id: string; node: number }> = [];
  for (const owner of owners) roots.push({ id: owner.id,
    node: yield* register(owner.directory, rootInputs.get(fs.realpathSync.native(owner.directory))!.contents ? 'all' : 'none') });
  for (const [index, owner] of owners.entries()) yield* populate(roots[index]!.node, owner.development ?? false);
  const imported: number[] = [];
  for (const directory of discovered) {
    const index = yield* register(directory, dependencyContents);
    yield* populate(index, false);
    imported.push(index);
  }
  const identity = nodes.map(node => ({
    metadata: node.metadata,
    contents: node.contents,
    files: node.files.map(file => [file.path, file.hash, file.mode & 0o111, path.relative(node.directory, file.source)]),
    unread: node.unread,
    directories: node.directories.map(directory => [directory.path, path.relative(node.directory, directory.source)]),
    links: node.links.map(link => [link.path, path.relative(node.directory, link.target)]),
    dependencies: node.dependencies,
  }));
  return { hash: createHash('sha256').update(JSON.stringify({ roots, imported, nodes: identity })).digest('hex'), roots, imported, nodes };
}

/** Synchronous consumers and capture share the same traversal, callbacks and content identity. */
export function readPackageInputs(owners: readonly PackageInputOwner[], options: PackageInputOptions = {}): PackageInputs {
  const reads = packageInputReads(owners, options);
  let next = reads.next();
  while (!next.done) next = reads.next(fs.readFileSync(next.value));
  return next.value;
}

/** Yield filesystem work during installation capture without weakening byte verification. */
export async function readPackageInputsAsync(owners: readonly PackageInputOwner[],
  options: PackageInputOptions & { signal?: AbortSignal } = {}): Promise<PackageInputs> {
  options.signal?.throwIfAborted();
  const reads = packageInputReads(owners, options);
  let next = reads.next();
  while (!next.done) {
    options.signal?.throwIfAborted();
    next = reads.next(await fs.promises.readFile(next.value, { signal: options.signal }));
  }
  return next.value;
}
