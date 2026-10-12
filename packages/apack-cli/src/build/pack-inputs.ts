import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

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
      if (name === '.git' || name === 'node_modules' || relative === 'dist' || relative === '.apack'
        || (!generated && relative === 'src/__generated__')) continue;
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
