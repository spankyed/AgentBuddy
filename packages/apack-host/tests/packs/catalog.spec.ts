import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { _declarationRevision, PACK_SNAPSHOT_FORMAT, type PackManifest } from '@apackdev/sdk/build';
import { resolveName } from '@apackdev/sdk/ids';
import type { SettingsDefinition } from '@apackdev/sdk/framework';
import { createContributionCatalog } from '../../src/packs/catalog.ts';
import { PACK_LAYOUT, readPackArtifact } from '../../src/packs/layout.ts';
import { sealPack } from './runtime/artifact-fixture.ts';

const app: SettingsDefinition = { schema: { type: 'object', properties: { compact: { type: 'boolean' } }, required: ['compact'], additionalProperties: false }, defaults: { compact: false } };
const group: SettingsDefinition = { schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false }, defaults: { name: '' } };

function source(id: string, enabled = true) {
  const manifest: PackManifest = { id, name: id, version: '1.0.0', extensions: { settings: { assistant: structuredClone(group) } } };
  return { dir: `/packs/${id}`, enabled, snapshot: { format: PACK_SNAPSHOT_FORMAT, declarationRevision: _declarationRevision(manifest), manifest, types: { entities: {}, relKinds: {} }, defs: {} } };
}

describe('contribution catalog data', () => {
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
      input.snapshot.manifest.features = { notes: { settings: { ...structuredClone(group), defaults: { name: id } } } };
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
      input.snapshot.manifest.features = { notes: { settings: structuredClone(group) } };
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
