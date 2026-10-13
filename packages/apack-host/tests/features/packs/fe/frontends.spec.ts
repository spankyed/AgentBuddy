// Loading a pack's frontend: the URL its files are at (with the revision, so an updated pack isn't served from the
// cache), what a default export has to declare to count as a registration, and what unloading takes back. The
// window's part — the import and the stylesheet — is a fake here, so these are the rules alone.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackFERegistration, Plugin, SettingsPort } from '@apackdev/sdk/fe';
import { createPackFrontends, loadPackFEEntry, type PackFrontendIO } from '../../../../src/fe/index.ts';
import type { FePackRegistry } from '../../../../src/fe/pack-store.ts';

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
const artifactRevision = 'a'.repeat(64);
const warnings = () => warn.mock.calls.map(args => args.join(' '));

describe('loadPackFEEntry', () => {
  it("imports the entry at the revision's URL, so a rebuilt frontend isn't served from the cache", async () => {
    const { io, imported } = fakeIO({ [`pack://ext/artifacts/${artifactRevision}/runtime/fe.js`]: { features: {} } });

    await loadPackFEEntry(io, 'runtime/fe.js', `pack://ext/artifacts/${artifactRevision}`);

    expect(imported).toEqual([`pack://ext/artifacts/${artifactRevision}/runtime/fe.js`]);
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
  it('loads explicit development modules directly without installed styles or a disk fallback', async () => {
    const url = 'http://localhost:5199';
    const registration = { id: 'ext', declarationRevision: 'current', features: {} };
    const { io, imported, styles } = fakeIO({ [`${url}/runtime/fe.js`]: registration });
    const { registry, registered } = fakeRegistry();
    const pack = { id: 'ext', name: 'Ext', version: '1.0.0', declarationRevision: 'current',
      developmentBaseUrl: url, feEntry: 'runtime/fe.js', feStyles: 'runtime/fe.css' };
    await createPackFrontends(io, registry).load(pack);
    expect(imported).toEqual([`${url}/runtime/fe.js`]);
    expect(styles).toEqual([]);
    expect(registered).toEqual([registration]);
    const failed = fakeIO({ [`pack://ext/artifacts/${artifactRevision}/runtime/fe.js`]: registration });
    await expect(createPackFrontends(failed.io, registry).load({ ...pack, artifactRevision })).rejects.toThrow('Failed to fetch');
    expect(failed.imported).toEqual([`${url}/runtime/fe.js`]);
  });

  it('refuses installed delivery without an accepted artifact before importing or adding styles', async () => {
    const { io, imported, styles } = fakeIO();
    const { registry, registered } = fakeRegistry();
    await expect(createPackFrontends(io, registry).load({ id: 'ext', name: 'Ext', version: '1.0.0',
      declarationRevision: 'current', feEntry: 'runtime/fe.js' })).rejects.toThrow('no accepted artifact identity');
    expect(imported).toEqual([]);
    expect(styles).toEqual([]);
    expect(registered).toEqual([]);
  });

  it('refuses a failed stylesheet before registering the frontend or granting settings access', async () => {
    const registration = { id: 'ext', declarationRevision: 'current', features: {}, bindSettings: vi.fn() };
    const { io } = fakeIO({ [`pack://ext/artifacts/${artifactRevision}/runtime/fe.js`]: registration });
    io.styles.add = vi.fn().mockRejectedValue(new Error('Rejected artifact styles'));
    io.settingsForPack = vi.fn();
    const { registry, registered } = fakeRegistry();
    await expect(createPackFrontends(io, registry).load({ id: 'ext', name: 'Ext', version: '1.0.0',
      declarationRevision: 'current', artifactRevision, feEntry: 'runtime/fe.js', feStyles: 'runtime/fe.css',
    })).rejects.toThrow('Rejected artifact styles');
    expect(registered).toEqual([]);
    expect(io.settingsForPack).not.toHaveBeenCalled();
  });

  it('registers what its entry exports, and answers with the plugins it added', async () => {
    const registration = { id: 'memo-pack', declarationRevision: 'current', features: { memos: { plugin: {} } } };
    const { io } = fakeIO({ [`pack://memo-pack/artifacts/${artifactRevision}/runtime/fe.js`]: registration });
    const { registry, registered } = fakeRegistry();

    const plugins = await createPackFrontends(io, registry).load({ id: 'memo-pack', declarationRevision: 'current', artifactRevision, name: 'Memos', version: '1.0.0', feEntry: 'runtime/fe.js' });

    expect(registered).toEqual([registration]);
    expect(plugins).toEqual([{ id: 'memo-pack/memos' }]);
  });

  it('is null for a pack with no frontend code, whose systems were told already', async () => {
    const { io } = fakeIO();
    const { registry, registered } = fakeRegistry();

    expect(await createPackFrontends(io, registry).load({ id: 'backend-only', declarationRevision: 'current', artifactRevision, name: 'B', version: '1.0.0' })).toBeNull();
    expect(registered).toEqual([]);
  });

  it('adds its stylesheet once however often it loads, and takes it out when the pack goes', async () => {
    const { io, styles } = fakeIO({ [`pack://ext/artifacts/${artifactRevision}/runtime/fe.js`]: { id: 'ext', declarationRevision: 'current', features: {} } });
    const { registry, unregistered } = fakeRegistry();
    const frontends = createPackFrontends(io, registry);
    // Its revision is in the stylesheet's URL too: a browser caches a stylesheet by URL, so an updated pack's
    // styles would be served from the cache without it
    const pack = { id: 'ext', declarationRevision: 'current', artifactRevision, name: 'Ext', version: '1.0.0', feStyles: 'runtime/fe.css', feEntry: 'runtime/fe.js' };

    await frontends.load(pack);
    await frontends.load(pack);
    expect(styles).toEqual([{ packId: 'ext', href: `pack://ext/artifacts/${artifactRevision}/runtime/fe.css` }]);

    frontends.unload('ext');
    expect(styles).toEqual([]);
    expect(unregistered).toEqual(['ext']);
  });

  it('loads styles-only packs without executing or registering a frontend', async () => {
    const { io, styles, imported } = fakeIO();
    const { registry, registered } = fakeRegistry();
    expect(await createPackFrontends(io, registry).load({
      id: 'theme', declarationRevision: 'current', artifactRevision, name: 'Theme', version: '1.0.0', feStyles: 'runtime/fe.css',
    })).toBeNull();
    expect(styles).toEqual([{ packId: 'theme', href: `pack://theme/artifacts/${artifactRevision}/runtime/fe.css` }]);
    expect(imported).toEqual([]);
    expect(registered).toEqual([]);
  });

  it.each([
    undefined,
    { id: 'other', declarationRevision: 'current', features: {} },
    { id: 'ext', declarationRevision: 'previous', features: {} },
  ])('rejects mismatched frontend bindings without registration or styles: %j', async registration => {
    const { io, styles } = fakeIO({ [`pack://ext/artifacts/${artifactRevision}/runtime/fe.js`]: registration });
    const { registry, registered } = fakeRegistry();
    await expect(createPackFrontends(io, registry).load({
      id: 'ext', declarationRevision: 'current', artifactRevision, name: 'Ext', version: '1.0.0', feEntry: 'runtime/fe.js', feStyles: 'runtime/fe.css',
    })).rejects.toThrow('Pack "ext"');
    expect(registered).toEqual([]);
    expect(styles).toEqual([]);
  });

  it('obtains a settings binding only after frontend declaration acceptance', async () => {
    const registration = { id: 'ext', declarationRevision: 'current', features: {}, bindSettings: vi.fn() };
    const { io } = fakeIO({ [`pack://ext/artifacts/${artifactRevision}/runtime/fe.js`]: registration });
    const binding = { port: {} as SettingsPort, dispose: vi.fn() };
    const settingsForPack = vi.fn(async () => binding);
    io.settingsForPack = settingsForPack;
    const registerPackFE = vi.fn(() => []);
    const packs = { registerPackFE } as unknown as FePackRegistry;
    const pack = { id: 'ext', declarationRevision: 'current', artifactRevision, name: 'Ext', version: '1.0.0', feEntry: 'runtime/fe.js' };
    await createPackFrontends(io, packs).load(pack);
    expect(settingsForPack).toHaveBeenCalledWith(pack);
    expect(registerPackFE).toHaveBeenCalledWith(registration, binding);
    settingsForPack.mockClear();
    registration.declarationRevision = 'stale';
    await expect(createPackFrontends(io, packs).load(pack)).rejects.toThrow('Pack "ext"');
    expect(settingsForPack).not.toHaveBeenCalled();
  });

  it('refuses a generated frontend without a host settings provider before adding styles', async () => {
    const { io, styles } = fakeIO({ [`pack://ext/artifacts/${artifactRevision}/runtime/fe.js`]: { id: 'ext', declarationRevision: 'current', features: {}, bindSettings: vi.fn() } });
    const { registry, registered } = fakeRegistry();
    await expect(createPackFrontends(io, registry).load({
      id: 'ext', declarationRevision: 'current', artifactRevision, name: 'Ext', version: '1.0.0', feEntry: 'runtime/fe.js', feStyles: 'runtime/fe.css',
    })).rejects.toThrow('requires host-bound settings');
    expect(registered).toEqual([]);
    expect(styles).toEqual([]);
  });
});
