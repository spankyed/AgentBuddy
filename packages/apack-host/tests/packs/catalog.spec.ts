import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { _declarationRevision, PACK_SNAPSHOT_FORMAT, type PackManifest } from '@apackdev/sdk/build';
import { resolveName } from '@apackdev/sdk/ids';
import type { SettingsDefinition } from '@apackdev/sdk/framework';
import { createContributionCatalog, readInstalledContributionCatalog } from '../../src/packs/catalog.ts';
import { PACK_LAYOUT, readPackArtifact } from '../../src/packs/layout.ts';
import { sealPack } from './runtime/artifact-fixture.ts';

const app: SettingsDefinition = { schema: { type: 'object', properties: { compact: { type: 'boolean' } }, required: ['compact'], additionalProperties: false }, defaults: { compact: false } };
const group: SettingsDefinition = { schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false }, defaults: { name: '' } };

function source(id: string, enabled = true) {
  const manifest: PackManifest = { id, name: id, version: '1.0.0', extensions: { settings: { assistant: structuredClone(group) } } };
  return { dir: `/packs/${id}`, enabled, snapshot: { format: PACK_SNAPSHOT_FORMAT, declarationRevision: _declarationRevision(manifest), manifest, types: { entities: {}, relKinds: {} }, defs: {} } };
}

describe('contribution catalog data', () => {
  it('reads help and plugins from a disabled sealed artifact without executing its poisoned runtime', () => {
    const packsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-help-discovery-'));
    const dir = path.join(packsDir, 'help-pack');
    try {
      const manifest: PackManifest = { id: 'help-pack', name: 'Help', version: '1.0.0',
        features: { notes: { description: 'Feature declaration fixture.', plugin: { label: 'Cold Notes', state: 'src/state.ts', canvas: 'src/canvas.vue' } } }, extensions: { help: { path: 'help' } } };
      const snapshot = { declarationRevision: _declarationRevision(manifest), format: PACK_SNAPSHOT_FORMAT,
        manifest, types: { entities: {}, relKinds: {} }, defs: {},
        help: [{ id: 'start', title: 'Start', body: 'Available without activation', features: ['notes'] }] };
      fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'types'));
      fs.writeFileSync(path.join(dir, PACK_LAYOUT.manifest), JSON.stringify(manifest));
      fs.writeFileSync(path.join(dir, PACK_LAYOUT.snapshot), JSON.stringify(snapshot));
      const marker = path.join(packsDir, 'executed');
      fs.writeFileSync(path.join(dir, PACK_LAYOUT.runtimeEntry), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('Do not activate');`);
      fs.writeFileSync(path.join(dir, PACK_LAYOUT.feEntry), `throw new Error('Do not activate frontend');`);
      sealPack(dir);
      const catalog = readInstalledContributionCatalog(packsDir, new Set(['help-pack']));
      const accepted = readPackArtifact(dir);
      expect(catalog.get('help-pack')?.artifactRevision).toBe(accepted.revision);
      expect(catalog.get('help-pack')?.integrity?.files).toEqual(accepted.integrity.files);
      expect(() => {
        // @ts-expect-error The accepted asset receipt is immutable at the reader boundary.
        catalog.get('help-pack')!.integrity!.files[PACK_LAYOUT.runtimeEntry] = 'changed';
      }).toThrow();
      expect(catalog.help().articles).toEqual([{ ...snapshot.help[0], packId: 'help-pack', packName: 'Help' }]);
      expect(catalog.get('help-pack')?.enabled).toBe(false);
      expect(catalog.plugins()).toMatchObject([{ featureRef: 'help-pack/notes', origin: 'installed', enabled: false, declaration: { label: 'Cold Notes', canvas: 'src/canvas.vue' } }]);
      expect(fs.existsSync(marker)).toBe(false);
      catalog.help().articles[0].body = 'Mutated reader';
      expect(catalog.help().articles[0].body).toBe('Available without activation');
    } finally { fs.rmSync(packsDir, { recursive: true, force: true }); }
  });
  it('keeps host settings available with no packs', () => {
    const catalog = createContributionCatalog(app);
    expect(catalog.getSnapshot().appSettings.defaults).toEqual({ compact: false });
    expect(catalog.getSnapshot().packs).toEqual([]);
  });

  it('namespaces equal group IDs and retains disabled declarations', () => {
    const catalog = createContributionCatalog(app);
    const second = source('second', false);
    second.snapshot.manifest.extensions!.settings!.assistant.defaults.name = 'Second';
    second.snapshot.declarationRevision = _declarationRevision(second.snapshot.manifest);
    catalog.replace([source('first'), second]);
    expect(catalog.packSettings('first').assistant.defaults.name).toBe('');
    expect(catalog.packSettings('second').assistant.defaults.name).toBe('Second');
    expect(catalog.get('second')?.enabled).toBe(false);
    expect(catalog.packSettings('missing')).toEqual({});
  });

  it('discovers disabled feature definitions under their owner without activation', () => {
    const catalog = createContributionCatalog(app);
    const inputs = ['first', 'second'].map(id => {
      const input = source(id, false);
      input.snapshot.manifest.features = { notes: { description: 'Feature declaration fixture.', settings: { ...structuredClone(group), defaults: { name: id } } } };
      input.snapshot.declarationRevision = _declarationRevision(input.snapshot.manifest);
      return input;
    });
    catalog.replace(inputs);
    expect(catalog.featureSettings(resolveName('first/notes'))?.defaults.name).toBe('first');
    expect(catalog.featureSettings(resolveName('second/notes'))?.defaults.name).toBe('second');
    expect(catalog.featureSettings(resolveName('missing/notes'))).toBeUndefined();
    const declaration = catalog.featureSettings(resolveName('first/notes'))!;
    expect(() => {
      // @ts-expect-error Catalog declarations are immutable at both boundaries.
      declaration.defaults.name = 'Changed';
    }).toThrow();
    catalog.replace([]);
    expect(catalog.featureSettings(resolveName('first/notes'))).toBeUndefined();
  });

  it('publishes atomically and notifies only after accepting the whole candidate', () => {
    const catalog = createContributionCatalog(app);
    const listener = vi.fn(() => expect(catalog.get('first')).toBeDefined());
    const unsubscribe = catalog.onChanged(listener);
    catalog.replace([source('first')]);
    const previous = catalog.getSnapshot();
    expect(() => catalog.replace([source('second'), { ...source('broken'), snapshot: {} }])).toThrow('Pack declarations');
    expect(catalog.getSnapshot()).toBe(previous);
    expect(catalog.get('first')).toBeDefined();
    expect(catalog.get('second')).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => catalog.replace([source('first'), { ...source('first'), dir: '/other/first' }])).toThrow('/packs/first and /other/first');
    expect(catalog.getSnapshot()).toBe(previous);
    expect(catalog.get('first')).toBeDefined();
    unsubscribe();
    catalog.replace([]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(catalog.get('first')).toBeUndefined();
    expect(catalog.getSnapshot().revision).toBe(2);
  });

  it('publishes diagnostics atomically, owns them, and retains them through other declaration changes', () => {
    const catalog = createContributionCatalog(app);
    const problems = [{ id: 'broken', dir: '/packs/broken', enabled: false, message: 'Invalid snapshot' }];
    const seen: string[][] = [];
    catalog.onChanged(() => seen.push(catalog.getSnapshot().problems.map(problem => problem.message)));
    catalog.replace([source('first')], problems);
    const previous = catalog.getSnapshot();
    problems[0].message = 'Changed input';
    expect(previous.problems[0].message).toBe('Invalid snapshot');
    expect(Object.isFrozen(previous.problems[0])).toBe(true);
    expect(() => catalog.replace([{ ...source('broken'), snapshot: {} }], [])).toThrow();
    expect(catalog.getSnapshot()).toBe(previous);
    catalog.setNative([{ id: 'native' }]);
    expect(catalog.getSnapshot().problems).toEqual(previous.problems);
    const acceptedSettings = catalog.settings();
    catalog.replace([source('first')]);
    expect(catalog.settings()).toBe(acceptedSettings);
    expect(seen).toEqual([['Invalid snapshot'], ['Invalid snapshot'], []]);
  });

  it('preserves revision and snapshot identity when declarations have not changed', () => {
    const catalog = createContributionCatalog(app);
    const listener = vi.fn();
    catalog.onChanged(listener);
    catalog.replace([source('first')]);
    const previous = catalog.getSnapshot();
    catalog.replace([source('first')]);
    catalog.setNative([]);
    expect(catalog.getSnapshot()).toBe(previous);
    expect(catalog.settings().revision).toBe(previous.revision);
    expect(listener).toHaveBeenCalledTimes(1);
    catalog.replace([source('first', false)]);
    expect(catalog.getSnapshot().revision).toBe(previous.revision + 1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('projects native declarations through the same immutable lookup contract', () => {
    const catalog = createContributionCatalog(app);
    catalog.setNative([{ id: 'native', settings: { assistant: group }, features: { notes: { description: 'Feature declaration fixture.', settings: group } } }]);
    expect(catalog.packSettings('native').assistant).toEqual(group);
    expect(catalog.featureSettings(resolveName('native/notes'))).toEqual(group);
    expect(catalog.settings().dependencies.native).toEqual([]);
    const previous = catalog.getSnapshot();
    expect(() => catalog.replace([source('native')])).toThrow('Duplicate');
    expect(catalog.getSnapshot()).toBe(previous);
    expect(catalog.packSettings('native').assistant).toEqual(group);
  });

  it('owns immutable copies rather than letting inputs or readers alter declarations', () => {
    const input = source('first');
    const catalog = createContributionCatalog(app);
    catalog.replace([input]);
    input.snapshot.manifest.extensions!.settings!.assistant.defaults.name = 'Altered';
    expect(catalog.packSettings('first').assistant.defaults.name).toBe('');
    expect(() => {
      // @ts-expect-error The view also forbids mutation at the type boundary.
      catalog.packSettings('first').assistant.defaults.name = 'Reader mutation';
    }).toThrow();
  });

  it('keeps a committed publication and other listeners usable when one subscriber throws', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const catalog = createContributionCatalog(app);
      const later = vi.fn();
      catalog.onChanged(() => { throw new Error('broken subscriber'); });
      catalog.onChanged(later);
      expect(() => catalog.replace([source('first')])).not.toThrow();
      expect(catalog.get('first')).toBeDefined();
      expect(later).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });

  it('reads installed settings without loading a poisoned runtime or changing files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-catalog-data-'));
    try {
      fs.mkdirSync(path.join(dir, 'types'));
      fs.mkdirSync(path.join(dir, 'runtime'));
      const runtime = path.join(dir, PACK_LAYOUT.runtimeEntry);
      fs.writeFileSync(runtime, 'throw new Error("catalog executed runtime");');
      const file = path.join(dir, PACK_LAYOUT.snapshot);
      const input = source('poisoned');
      input.snapshot.manifest.features = { notes: { description: 'Feature declaration fixture.', settings: structuredClone(group) } };
      input.snapshot.declarationRevision = _declarationRevision(input.snapshot.manifest);
      fs.writeFileSync(file, JSON.stringify(input.snapshot));
      fs.writeFileSync(path.join(dir, PACK_LAYOUT.manifest), JSON.stringify(input.snapshot.manifest));
      sealPack(dir);
      const before = fs.readFileSync(file, 'utf8');
      const catalog = createContributionCatalog(app);
      catalog.replace([{ snapshot: readPackArtifact(dir).snapshot, dir, enabled: false }]);
      expect(catalog.packSettings('poisoned').assistant.defaults.name).toBe('');
      expect(catalog.featureSettings(resolveName('poisoned/notes'))?.defaults.name).toBe('');
      expect(fs.readFileSync(file, 'utf8')).toBe(before);
      expect(fs.readFileSync(runtime, 'utf8')).toContain('throw new Error');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

it('keeps validated source declarations independent of executable and native registration changes', () => {
  const catalog = createContributionCatalog(app);
  const manifest = source('author').snapshot.manifest;
  const declarationRevision = _declarationRevision(manifest);
  catalog.setSources([{ manifest, dir: '/source/author', declarationRevision }]);
  catalog.setNative([{ id: 'host' }]);
  catalog.replace([source('dependency')]);
  catalog.setNative([]);
  expect(catalog.packSettings('author').assistant.defaults.name).toBe('');
  expect(catalog.getSnapshot().sourcePacks[0].declarationRevision).toBe(declarationRevision);
  manifest.extensions!.settings!.assistant.defaults.name = 'Mutated caller';
  expect(catalog.packSettings('author').assistant.defaults.name).toBe('');
  expect(Object.isFrozen(catalog.getSnapshot().sourcePacks[0].manifest)).toBe(true);
});

it('refuses stale source identities and cross-admission owner collisions atomically', () => {
  const catalog = createContributionCatalog(app);
  const manifest = source('author').snapshot.manifest;
  catalog.setSources([{ manifest, dir: '/source/author', declarationRevision: _declarationRevision(manifest) }]);
  const before = catalog.getSnapshot();
  expect(() => catalog.setSources([{ manifest, dir: '/source/author', declarationRevision: 'stale' }])).toThrow('stale declaration');
  expect(() => catalog.replace([source('author')])).toThrow('Duplicate');
  expect(catalog.getSnapshot()).toBe(before);
});

it('checks source binding identity before acceptance and preserves declarations after unload', async () => {
  const { createPackRegistry } = await import('../../src/packs/registry.ts');
  const packs = createPackRegistry();
  const manifest = source('author').snapshot.manifest;
  const declarationRevision = _declarationRevision(manifest);
  packs.catalog.setSources([{ manifest, dir: '/source/author', declarationRevision }]);
  const origin = { id: manifest.id, name: manifest.name, version: manifest.version, dir: '/source/author', manifest, declarationRevision };
  const registration = { id: manifest.id, declarationRevision, settings: manifest.extensions!.settings };
  const before = packs.catalog.getSnapshot();
  expect(() => packs.registerPack({ ...registration, declarationRevision: 'stale' }, origin)).toThrow('accepted source declarations');
  expect(packs.packOrigin(manifest.id)).toBeNull();
  expect(packs.catalog.getSnapshot()).toBe(before);
  packs.registerPack(registration, origin);
  packs.unregisterPack(manifest.id);
  expect(packs.settingsCatalog().packs.author.assistant.defaults).toEqual({ name: '' });
});


it('projects native, disabled installed and authoring plugins without activating implementations', () => {
  const catalog = createContributionCatalog(app);
  const native = { id: 'native', features: { view: { description: 'Feature declaration fixture.', plugin: { label: 'Native view', state: 'native/state', canvas: 'native/canvas' } } } };
  catalog.setNative([native]);
  const installed = source('installed', false);
  installed.snapshot.manifest.features = { view: { description: 'Feature declaration fixture.', plugin: { label: 'Installed view', state: 'src/state.ts',
    canvas: { routes: { list: 'src/list.vue', view: { entry: 'src/view.vue', load: 'lazy' } } } } } };
  installed.snapshot.declarationRevision = _declarationRevision(installed.snapshot.manifest);
  catalog.replace([installed]);
  const author = { id: 'author', name: 'Author', version: '1.0.0', features: { view: { description: 'Present an author view.', plugin: { label: 'Author view', state: 'src/state.ts' } } } };
  catalog.setSources([{ dir: '/source/author', manifest: author, declarationRevision: _declarationRevision(author) }]);
  expect(catalog.plugins()).toMatchObject([
    { featureRef: 'native/view', origin: 'native', enabled: true, declaration: { label: 'Native view' } },
    { featureRef: 'installed/view', origin: 'installed', enabled: false, declaration: { label: 'Installed view' } },
    { featureRef: 'author/view', origin: 'source', declaration: { label: 'Author view' } },
  ]);
  expect(catalog.plugins()[0].declarationRevision).toBeUndefined();
  expect(catalog.plugins()[2].enabled).toBeUndefined();
  native.features.view.plugin.label = 'Changed caller';
  expect(catalog.plugins()[0].declaration.label).toBe('Native view');
  expect(Reflect.set(catalog.plugins()[0].declaration, 'label', 'Changed reader')).toBe(false);
  expect(catalog.plugins()[0].declaration.label).toBe('Native view');
  catalog.replace([]);
  expect(catalog.plugins().map(plugin => plugin.origin)).toEqual(['native', 'source']);
});

it('keeps reference metadata immutable and independent of native, installed and source activation', () => {
  const references = {
    types: { memo: { category: 'memos', icon: 'NotebookText', svgElements: [], navigate: 'src/references.ts#openMemo' } },
    categories: { memos: { label: 'Memos', icon: 'NotebookText', useItems: 'src/references.ts#useItems' } },
  };
  const catalog = createContributionCatalog(app);
  catalog.setNative([{ id: 'native', features: { memos: { description: 'Feature declaration fixture.', references } } }]);
  const installed = source('installed', false);
  installed.snapshot.manifest.features = { memos: { description: 'Feature declaration fixture.', references } };
  installed.snapshot.declarationRevision = _declarationRevision(installed.snapshot.manifest);
  catalog.replace([installed]);
  const author = { id: 'author', name: 'Author', version: '1.0.0', features: { memos: { description: 'Manage memos.', references } } };
  catalog.setSources([{ dir: '/source/author', manifest: author, declarationRevision: _declarationRevision(author) }]);
  expect(catalog.references()).toMatchObject([
    { featureRef: 'native/memos', origin: 'native', enabled: true, declaration: references },
    { featureRef: 'installed/memos', origin: 'installed', enabled: false, declaration: references },
    { featureRef: 'author/memos', origin: 'source', declaration: references },
  ]);
  expect(catalog.references()[0].declarationRevision).toBeUndefined();
  expect(catalog.references()[2].enabled).toBeUndefined();
  references.categories.memos.label = 'Changed caller';
  expect(catalog.references()[0].declaration.categories.memos.label).toBe('Memos');
  expect(Reflect.set(catalog.references()[1].declaration.categories.memos, 'label', 'Changed reader')).toBe(false);
  catalog.replace([]);
  expect(catalog.references().map(entry => entry.origin)).toEqual(['native', 'source']);
});
