// Loading a pack's frontend: the URL its files are at (with the revision, so an updated pack isn't served from the
// cache), what a default export has to declare to count as a registration, and what unloading takes back. The
// window's part — the import and the stylesheet — is a fake here, so these are the rules alone.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackFERegistration, Plugin } from '@abuddy/sdk/fe';
import { createPackFrontends, loadPackFEEntry, type PackFrontendIO } from '../../../src/fe/index.ts';
import type { FePackRegistry } from '../../../src/fe/pack-store.ts';

/** The window's half, recorded: each import by URL, and the stylesheets a pack has */
function fakeIO(modules: Record<string, unknown> = {}) {
  const styles: Array<{ packId: string; href: string }> = [];
  const imported: string[] = [];
  const io: PackFrontendIO = {
    importModule: async (url) => {
      imported.push(url);
      const bare = url.split('?')[0];
      if (!(url in modules) && !(bare in modules)) throw new Error(`Failed to fetch ${url}`);
      return { default: (url in modules ? modules[url] : modules[bare]) };
    },
    styles: {
      // As the window's does: one stylesheet per pack and href, so two packs may share an href
      add: async (packId, href) => { if (!styles.some(s => s.packId === packId && s.href === href)) styles.push({ packId, href }); },
      remove: (packId) => { for (let i = styles.length - 1; i >= 0; i--) if (styles[i].packId === packId) styles.splice(i, 1); },
    },
  };
  return { io, styles, imported };
}

/** A registry that records what was registered and unregistered */
function fakeRegistry() {
  const registered: PackFERegistration[] = [];
  const unregistered: string[] = [];
  const registry = {
    registerPackFE: (registration: PackFERegistration) => { registered.push(registration); return [{ id: 'memo-pack/memos' }] as unknown as Plugin[]; },
    unregisterPackFE: (packId: string) => { unregistered.push(packId); return [] as Plugin[]; },
  } as unknown as FePackRegistry;
  return { registry, registered, unregistered };
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
const warnings = () => warn.mock.calls.map(args => args.join(' '));

describe('loadPackFEEntry', () => {
  it("imports the entry at the revision's URL, so a rebuilt frontend isn't served from the cache", async () => {
    const { io, imported } = fakeIO({ 'pack://ext/runtime/fe.js?v=b': { features: {} } });

    await loadPackFEEntry(io, 'runtime/fe.js', 'pack://ext', 'b');

    expect(imported).toEqual(['pack://ext/runtime/fe.js?v=b']);
  });

  it('warns when the entry has no default export and so registers nothing', async () => {
    const { io } = fakeIO({ 'pack://ext/fe.js': undefined });

    // Loaded with nothing, rather than its module namespace registered as a pack with no id
    expect(await loadPackFEEntry(io, 'fe.js', 'pack://ext')).toBeNull();
    expect(warnings()).toEqual([expect.stringMatching(/registers nothing[\s\S]*no default export/)]);
  });

  it('warns when the default export declares no registration fields', async () => {
    const { io } = fakeIO({ 'pack://ext/fe.js': { plugin: { id: 'typo' } } });

    await loadPackFEEntry(io, 'fe.js', 'pack://ext');

    expect(warnings()).toEqual([expect.stringMatching(/registers nothing[\s\S]*default export declares none of them/)]);
  });

  it("doesn't warn for the generated entry of a pack without FE extensions", async () => {
    const { io } = fakeIO({ 'pack://ext/fe.js': { features: {} } });

    await loadPackFEEntry(io, 'fe.js', 'pack://ext');

    expect(warnings()).toEqual([]);
  });

  // The E2E fixture fails a pack under test on this line, so its text is a contract
  it('throws when the entry fails to import, logging which entry', async () => {
    const { io } = fakeIO();

    await expect(loadPackFEEntry(io, 'runtime/fe.js', 'pack://broken')).rejects.toThrow();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[pack-loader] Failed to load FE entry pack://broken/runtime/fe.js'),
      expect.anything(),
    );
  });
});

describe("a pack's frontend", () => {
  it('registers what its entry exports, and answers with the plugins it added', async () => {
    const { io } = fakeIO({ 'pack://memo-pack/runtime/fe.js': { features: { memos: { plugin: {} } } } });
    const { registry, registered } = fakeRegistry();

    const plugins = await createPackFrontends(io, registry).load({ id: 'memo-pack', name: 'Memos', version: '1.0.0', feEntry: 'runtime/fe.js' });

    expect(registered).toEqual([{ features: { memos: { plugin: {} } } }]);
    expect(plugins).toEqual([{ id: 'memo-pack/memos' }]);
  });

  it('is null for a pack with no frontend code, whose systems were told already', async () => {
    const { io } = fakeIO();
    const { registry, registered } = fakeRegistry();

    expect(await createPackFrontends(io, registry).load({ id: 'backend-only', name: 'B', version: '1.0.0' })).toBeNull();
    expect(registered).toEqual([]);
  });

  it('adds its stylesheet once however often it loads, and takes it out when the pack goes', async () => {
    const { io, styles } = fakeIO({ 'pack://ext/runtime/fe.js': { features: {} } });
    const { registry, unregistered } = fakeRegistry();
    const frontends = createPackFrontends(io, registry);
    // Its revision is in the stylesheet's URL too: a browser caches a stylesheet by URL, so an updated pack's
    // styles would be served from the cache without it
    const pack = { id: 'ext', name: 'Ext', version: '1.0.0', feStyles: 'runtime/fe.css', feEntry: 'runtime/fe.js', feRevision: 'abc123' };

    await frontends.load(pack);
    await frontends.load(pack);
    expect(styles).toEqual([{ packId: 'ext', href: 'pack://ext/runtime/fe.css?v=abc123' }]);

    frontends.unload('ext');
    expect(styles).toEqual([]);
    expect(unregistered).toEqual(['ext']);
  });
});
