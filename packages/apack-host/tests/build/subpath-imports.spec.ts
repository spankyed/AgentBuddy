import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSubpathImports } from '../../src/build/subpath-imports.ts';

let packDir: string;

beforeEach(() => { packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subpath-imports-')); });
afterEach(() => { fs.rmSync(packDir, { recursive: true, force: true }); });

const write = (rel: string, contents = 'export const x = 1') => {
  const full = path.join(packDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return full;
};
const manifest = (imports: unknown) => write('package.json', JSON.stringify({ name: 'p', type: 'module', imports }));

describe('readSubpathImports', () => {
  it('reads a plain string target', () => {
    manifest({ '#gen/*': './src/gen/*' });
    expect(readSubpathImports(packDir)).toEqual({ '#gen/*': './src/gen/*' });
  });

  it('is empty when the pack declares none, and when there is no package.json', () => {
    manifest(undefined);
    expect(readSubpathImports(packDir)).toEqual({});
    fs.rmSync(path.join(packDir, 'package.json'));
    expect(readSubpathImports(packDir)).toEqual({});
  });

  /**
   * `apack init` writes `"type": "module"`, so `import` is the condition a pack's own entries are most
   * likely to carry — and the reader tried `default`, then `require`, then `node`, never `import`. A pack
   * whose map named a source under `import` and a build under `default` silently bundled the build.
   */
  it('takes the first applicable condition in the order the pack wrote them', () => {
    manifest({ '#gen/*': { import: './src/gen/*', default: './dist/gen/*' } });
    expect(readSubpathImports(packDir)).toEqual({ '#gen/*': './src/gen/*' });
  });

  it('skips conditions that do not apply to a pack backend', () => {
    manifest({ '#gen/*': { types: './types/*', browser: './browser/*', node: './src/gen/*' } });
    expect(readSubpathImports(packDir)).toEqual({ '#gen/*': './src/gen/*' });
  });

  it('ignores a target it cannot flatten to one path', () => {
    manifest({ '#gen/*': { node: { import: './nested/*' } }, '#ok/*': './src/ok/*' });
    expect(readSubpathImports(packDir)).toEqual({ '#ok/*': './src/ok/*' });
  });

  // Silence meant the bundle lost every subpath import and then failed as "can't resolve #generated/…",
  // which names neither the file nor the cause
  it('says so when the manifest cannot be parsed, rather than losing them quietly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    write('package.json', '{ "imports": { not json');
    expect(readSubpathImports(packDir)).toEqual({});
    expect(warn.mock.calls.flat().join('\n')).toContain('package.json');
  });
});
