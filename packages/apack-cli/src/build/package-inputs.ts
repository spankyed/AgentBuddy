import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

export interface PackageInputOwner {
  readonly id: string;
  readonly directory: string;
  readonly development?: boolean;
}

/** Resolve package ownership without executing an entry or requiring package.json to be exported. */
function dependencyDirectory(owner: string, name: string): string | undefined {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) || name.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`Invalid npm dependency name: ${name}`);
  }
  for (const directory of createRequire(path.join(owner, 'package.json')).resolve.paths(name) ?? []) {
    const candidate = path.join(directory, name);
    if (fs.statSync(path.join(candidate, 'package.json'), { throwIfNoEntry: false })?.isFile()) {
      return fs.realpathSync(candidate);
    }
  }
}

function packageFilesHash(root: string, targets: readonly string[]): string {
  const hash = createHash('sha256');
  const ancestors = new Set<string>();
  const files = new Set<string>();
  function walk(file: string): void {
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isFile()) { files.add(path.relative(root, file).split(path.sep).join('/')); return; }
    if (!stat.isDirectory()) throw new Error(`Unsupported package input: ${file}`);
    const real = fs.realpathSync(file);
    if (ancestors.has(real)) throw new Error(`Cyclic package input: ${file}`);
    ancestors.add(real);
    for (const name of fs.readdirSync(file).sort()) {
      if (['node_modules', '.git', '.temp', '.apack', '.cache'].includes(name)) continue;
      walk(path.join(file, name));
    }
    ancestors.delete(real);
  }
  for (const target of targets) walk(path.join(root, target));
  for (const file of [...files].sort()) {
    const bytes = fs.readFileSync(path.join(root, file));
    hash.update(`${file.length}:${file}:${bytes.length}:`).update(bytes);
  }
  return hash.digest('hex');
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

/** Complete declared dependency scopes and resolution edges; diagnostic read logs are not inputs. */
export function packageInputsHash(owners: readonly PackageInputOwner[]): string {
  const seen = new Map<string, number>();
  const rootDevelopment = new Map<string, boolean>();
  for (const owner of owners) {
    const root = fs.realpathSync(owner.directory);
    rootDevelopment.set(root, (rootDevelopment.get(root) ?? false) || (owner.development ?? false));
  }
  const nodes: Array<{ metadata: string | null; files?: string; dependencies: Record<string, number | null> }> = [];
  function register(directory: string, contents: boolean): number {
    const root = fs.realpathSync(directory);
    const existing = seen.get(root);
    if (existing !== undefined) return existing;
    const index = nodes.length;
    seen.set(root, index);
    const file = path.join(root, 'package.json');
    const metadata = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    const manifest = metadata ? JSON.parse(metadata) : {};
    const node = { metadata, ...(contents && { files: packageFilesHash(root, packageTargets(manifest)) }),
      dependencies: {} as Record<string, number | null> };
    nodes.push(node);
    return index;
  }
  const populated = new Set<number>();
  function populate(directory: string, index: number, development: boolean): void {
    if (populated.has(index)) return;
    populated.add(index);
    const node = nodes[index]!;
    development = rootDevelopment.get(fs.realpathSync(directory)) ?? development;
    const manifest = node.metadata ? JSON.parse(node.metadata) : {};
    const names = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies,
      ...manifest.optionalDependencies, ...(development && manifest.devDependencies) }).sort();
    for (const name of names) {
      const dependency = dependencyDirectory(directory, name);
      if (!dependency) { node.dependencies[name] = null; continue; }
      const child = register(dependency, true);
      node.dependencies[name] = child;
      populate(dependency, child, false);
    }
  }
  // Root files have their own authored/implementation scope. Pre-register roots so cycles cannot
  // accidentally include their build output in their own input key.
  const roots = owners.map(owner => ({ id: owner.id, node: register(owner.directory, false) }));
  owners.forEach((owner, index) => populate(owner.directory, roots[index]!.node, owner.development ?? false));
  return createHash('sha256').update(JSON.stringify({ roots, nodes })).digest('hex');
}
