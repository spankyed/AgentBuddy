import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { _declarationRevision, PACK_SNAPSHOT_FORMAT, type PackManifest } from '@apackdev/sdk/build';
import type { SettingsDefinition } from '@apackdev/sdk/framework';
import { createContributionCatalog } from '../../src/packs/catalog.ts';
import { PACK_LAYOUT, readPackSnapshot } from '../../src/packs/layout.ts';

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
      fs.writeFileSync(file, JSON.stringify(source('poisoned').snapshot));
      const before = fs.readFileSync(file, 'utf8');
      const catalog = createContributionCatalog(app);
      catalog.replace([{ snapshot: readPackSnapshot(dir), dir, enabled: false }]);
      expect(catalog.packSettings('poisoned').assistant.defaults.name).toBe('');
      expect(fs.readFileSync(file, 'utf8')).toBe(before);
      expect(fs.readFileSync(runtime, 'utf8')).toContain('throw new Error');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
