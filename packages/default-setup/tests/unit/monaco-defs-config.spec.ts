import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * rollup-defs.config.mjs inlines every @abuddy/* type the Monaco DSL defs use through the
 * tsconfig.defs.json paths: Monaco can't resolve a package import left in the emitted declarations.
 */
const root = path.resolve(__dirname, '..', '..');
const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.defs.json'), 'utf-8')
  .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n'));
const paths = Object.keys(tsconfig.compilerOptions.paths as Record<string, string[]>);

describe('Monaco defs config', () => {
  const defsDir = path.join(root, 'src', 'defs');
  const specifiers = fs.readdirSync(defsDir).filter((f) => f.endsWith('.ts'))
    .flatMap((f) => [...fs.readFileSync(path.join(defsDir, f), 'utf-8').matchAll(/from\s+'(@abuddy\/[^']+)'/g)].map((m) => m[1]));

  it.each([...new Set(specifiers)])('maps %s to source', (specifier) => {
    const mapped = paths.some((pattern) => pattern === specifier || (pattern.endsWith('/*') && specifier.startsWith(pattern.slice(0, -1))));
    expect(mapped).toBe(true);
  });
});
