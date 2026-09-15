import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPackFEEntry, loadPackFrontend } from '../pack-loader';

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

  it('warns when the default export declares no registration fields', async () => {
    const { warnings } = await load('fe.mjs', 'export default { plugin: { id: "typo" } };');
    expect(warnings).toEqual([expect.stringMatching(/registers nothing[\s\S]*default export declares none of them/)]);
  });

  it("doesn't warn for the generated entry of a pack without FE contributions", async () => {
    const { warnings } = await load('fe.mjs', 'export default { plugins: [], defaultPlugin: undefined };');
    expect(warnings).toEqual([]);
  });

  it('accepts a registration that contributes plugins without warning', async () => {
    const { registration, warnings } = await load('fe.mjs', 'export default { plugins: [{ id: "x" }] };');
    expect((registration as any).plugins).toHaveLength(1);
    expect(warnings).toEqual([]);
  });
});

// A pack with frontend code is reported to the application actor once its load finished, whatever it added:
// the bus holds back its systems' startup data until then
describe('loadPackFrontend', () => {
  it('returns no plugins when the FE entry fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(loadPackFrontend({ id: 'broken', feEntry: 'runtime/fe.js' })).resolves.toEqual([]);
  });

  it('returns null for a pack without frontend code', async () => {
    await expect(loadPackFrontend({ id: 'backend-only' })).resolves.toBeNull();
  });
});
