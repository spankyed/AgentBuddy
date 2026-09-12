import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPackFEEntry } from '../pack-loader';

let dir: string;

beforeEach(() => {
  // Inside the Vite root (the test runner won't import files outside it); node_modules is gitignored
  const base = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.pack-loader-test');
  fs.mkdirSync(base, { recursive: true });
  dir = fs.mkdtempSync(path.join(base, 'case-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function load(file: string, source: string) {
  fs.writeFileSync(path.join(dir, file), source);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const registration = await loadPackFEEntry(file, pathToFileURL(dir).href);
  return { registration, warnings: warn.mock.calls.map(args => args.join(' ')) };
}

describe('loadPackFEEntry', () => {
  it('warns when the entry has no default export and so registers nothing', async () => {
    const { warnings } = await load('fe.mjs', 'export const plugins = [];');
    expect(warnings).toEqual([expect.stringMatching(/registers nothing[\s\S]*no default export/)]);
  });

  it('warns when the default export contributes nothing', async () => {
    const { warnings } = await load('fe.mjs', 'export default { plugins: [] };');
    expect(warnings).toEqual([expect.stringMatching(/registers nothing[\s\S]*default export is empty/)]);
  });

  it('accepts a registration that contributes plugins without warning', async () => {
    const { registration, warnings } = await load('fe.mjs', 'export default { plugins: [{ id: "x" }] };');
    expect((registration as any).plugins).toHaveLength(1);
    expect(warnings).toEqual([]);
  });
});
