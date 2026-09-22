import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPackFEEntry, loadPackFrontend, loadPackStyles, unloadPackFrontend } from '../pack-loader';

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

  it("doesn't warn for the generated entry of a pack without FE extensions", async () => {
    const { warnings } = await load('fe.mjs', 'export default { features: {} };');
    expect(warnings).toEqual([]);
  });

  it('accepts a registration that contributes plugins without warning', async () => {
    const { registration, warnings } = await load('fe.mjs', 'export default { features: { x: { plugin: {} } } };');
    expect(Object.keys((registration as any).features)).toEqual(["x"]);
    expect(warnings).toEqual([]);
  });
});

// A pack with frontend code is reported to the application actor once its load finished, whatever it added:
// the bus holds back its systems' startup data until then
describe('loadPackFrontend', () => {
  it('throws, saying to rebuild the pack, when the FE entry fails to import', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(loadPackFrontend({ id: 'broken', feEntry: 'runtime/fe.js' }))
      .rejects.toThrow(/\. If the pack was built for another AgentBuddy version, rebuild it with the current @abuddy\/cli$/);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[pack-loader] Failed to load FE entry pack://broken/runtime/fe.js'), expect.anything());
  });

  it('returns null for a pack without frontend code', async () => {
    await expect(loadPackFrontend({ id: 'backend-only' })).resolves.toBeNull();
  });
});

// A pack's stylesheet is added once however often the pack is loaded: a pack whose frontend is styles
// alone contributes no plugins, so a later load reaches it again. Unloading it takes the stylesheet out.
describe('loadPackStyles', () => {
  const packLinks = () => document.querySelectorAll('link[data-pack-id="ext"]');

  afterEach(() => {
    document.querySelectorAll('link[data-pack-id]').forEach(el => el.remove());
  });

  it('adds the stylesheet once and resolves for every later load', async () => {
    const first = loadPackStyles('ext', 'runtime/fe.css', 'pack://ext');
    expect(packLinks()).toHaveLength(1);
    expect(packLinks()[0].getAttribute('href')).toBe('pack://ext/runtime/fe.css');

    // The second load finds the stylesheet here and adds none, so it has nothing to wait for
    const second = loadPackStyles('ext', 'runtime/fe.css', 'pack://ext');
    expect(packLinks()).toHaveLength(1);
    await expect(second).resolves.toBeUndefined();

    packLinks()[0].dispatchEvent(new Event('load'));
    await expect(first).resolves.toBeUndefined();
  });

  it('adds it again once the pack is unloaded', () => {
    loadPackStyles('ext', 'runtime/fe.css', 'pack://ext');

    unloadPackFrontend('ext');
    expect(packLinks()).toHaveLength(0);

    loadPackStyles('ext', 'runtime/fe.css', 'pack://ext');
    expect(packLinks()).toHaveLength(1);
  });
});
