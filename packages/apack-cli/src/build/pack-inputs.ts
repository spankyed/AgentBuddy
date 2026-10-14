import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

/** Whether a pack-relative path belongs to authored inputs, shared by builds and watchers. */
export function isPackInputPath(relative: string, generated = false): boolean {
  const parts = relative.split(/[\\/]/);
  return !parts.some(part => part === '.git' || part === 'node_modules')
    && parts[0] !== 'dist' && parts[0] !== '.apack'
    && (generated || parts[0] !== 'src' || parts[1] !== '__generated__');
}

/** Authored files, regardless of extension or source folder; build/dependency trees are separate inputs. */
export function packInputFiles(root: string, { generated = false, modulesOnly = false }: { generated?: boolean; modulesOnly?: boolean } = {}): string[] {
  const files: string[] = [];
  const ancestors = new Set<string>();
  function walk(dir: string): void {
    const real = fs.realpathSync(dir);
    if (ancestors.has(real)) throw new Error(`Cyclic source directory: ${dir}`);
    ancestors.add(real);
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (!isPackInputPath(relative, generated)) continue;
      const stat = fs.statSync(file);
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile() && (!modulesOnly || /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|json)$/.test(name))) files.push(relative);
    }
    ancestors.delete(real);
  }
  if (fs.existsSync(root)) walk(root);
  return files;
}

/** Content identity includes filenames and additions/removals, with no timestamp or checkout-path dependence. */
export function packInputsHash(root: string, options?: { generated?: boolean; modulesOnly?: boolean }): string {
  const hash = createHash('sha256');
  for (const file of packInputFiles(root, options)) {
    const content = fs.readFileSync(path.join(root, file));
    hash.update(`${file.length}:${file}:${content.length}:`);
    hash.update(content);
  }
  return hash.digest('hex');
}
