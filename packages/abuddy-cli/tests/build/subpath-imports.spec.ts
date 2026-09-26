import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSubpathImports, resolveWithExtensions } from '../../src/build/subpath-imports';

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

describe('resolveWithExtensions', () => {
  it('takes an exact file, and one that needs its extension supplied', () => {
    const exact = write('gen/events.ts');
    expect(resolveWithExtensions(exact)).toBe(exact);
    expect(resolveWithExtensions(path.join(packDir, 'gen/events'))).toBe(exact);
  });

  /**
   * The loop used to begin with the empty extension and use `fs.existsSync`, which is true of a directory —
   * so a directory returned itself and the `index.ts` fallback written below it never ran. esbuild then got a
   * directory where it wanted a file, and the fallback was dead code for the one case it was written for.
   */
  it('takes the index inside a directory the import names', () => {
    const index = write('gen/repository/index.ts');
    expect(resolveWithExtensions(path.join(packDir, 'gen/repository'))).toBe(index);
  });

  it('never returns a directory', () => {
    fs.mkdirSync(path.join(packDir, 'gen/empty'), { recursive: true });
    expect(resolveWithExtensions(path.join(packDir, 'gen/empty'))).toBeUndefined();
  });

  // One list for the file and the index attempt: the two drifted, the first having .mts and .mjs and
  // neither of their CJS counterparts, the second only ever trying index.ts
  it.each(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'])('supplies %s, and index%s', (ext) => {
    const file = write(`a${ext}`);
    expect(resolveWithExtensions(path.join(packDir, 'a'))).toBe(file);
    const index = write(`d/index${ext}`);
    expect(resolveWithExtensions(path.join(packDir, 'd'))).toBe(index);
  });

  it('is undefined when nothing is there', () => {
    expect(resolveWithExtensions(path.join(packDir, 'nope'))).toBeUndefined();
  });
});

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
   * `abuddy init` writes `"type": "module"`, so `import` is the condition a pack's own entries are most
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
