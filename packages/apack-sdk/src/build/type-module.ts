import { existsSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';

/** Resolve a declared type-only module within the pack; never discover an undeclared contribution. */
export function resolveTypeModule(root: string, target: string, label: string): string {
  const normalized = target.split('\\').join('/');
  const canonicalRoot = realpathSync(root);
  const outside = (path: string) => {
    const local = relative(canonicalRoot, path).split('\\').join('/');
    return local === '..' || local.startsWith('../') || isAbsolute(local);
  };
  if (isAbsolute(normalized) || outside(resolve(canonicalRoot, normalized))) {
    throw new Error(`${label}: type module must be pack-root-relative and stay within the pack`);
  }
  const file = [normalized, `${normalized}.ts`, `${normalized}/index.ts`]
    .map(candidate => resolve(root, candidate))
    .find(candidate => ['.ts', '.tsx', '.mts', '.cts'].includes(extname(candidate))
      && existsSync(candidate) && statSync(candidate).isFile());
  if (!file) throw new Error(`${label}: no TypeScript module found at ${target} (.ts or /index.ts)`);
  if (outside(realpathSync(file))) throw new Error(`${label}: type module must stay within the pack`);
  return relative(root, file).split('\\').join('/');
}
