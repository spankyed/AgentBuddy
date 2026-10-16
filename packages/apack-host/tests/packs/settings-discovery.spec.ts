import { createNativePackTestRegistry } from '@apackdev/host/testing';
// Settings discovery uses verified declarations regardless of whether executable code can activate.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { _declarationRevision, PACK_SNAPSHOT_FORMAT, type PackManifest } from '@apackdev/sdk/build';
import { PACK_LAYOUT } from '../../src/packs/layout.ts';
import { sealPack } from './runtime/build-fixture.ts';

let packsDir: string;
beforeEach(() => { packsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-settings-discovery-')); });
afterEach(() => fs.rmSync(packsDir, { recursive: true, force: true }));
const definition = { defaults: { name: '' }, schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } };

function install(id: string, name = ''): string {
  const dir = path.join(packsDir, id);
  fs.mkdirSync(path.join(dir, 'types'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
  const manifest: PackManifest = { id, name: id, version: '1.0.0',
    extensions: { settings: { assistant: { ...definition, defaults: { name } } } },
    features: { memos: { description: 'Feature declaration fixture.', settings: definition } },
  };
  const snapshot = { format: PACK_SNAPSHOT_FORMAT, declarationRevision: _declarationRevision(manifest), manifest, types: { entities: {}, relKinds: {} }, entityDestinations: {}, facades: {} };
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.manifest), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.snapshot), JSON.stringify(snapshot));
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.runtimeEntry), 'throw new Error("must not activate during discovery");');
  sealPack(dir);
  return dir;
}

it('discovers verified disabled and activation-failed definitions without executing code', () => {
  install('disabled');
  install('failed');
  const registry = createNativePackTestRegistry();
  registry.refreshCatalog(packsDir, new Set(['disabled']));
  expect(Object.keys(registry.settingsCatalog().features)).toEqual(['disabled/memos', 'failed/memos']);
  expect(registry.catalog.get('disabled')?.enabled).toBe(false);
  registry.recordLoadProblem('failed', 'runtime throws');
  expect(registry.settingsCatalog().packs.failed.assistant.defaults).toEqual({ name: '' });
  expect(registry.loadedPacks()).toEqual([]);
  expect(registry.getPackRegistration('disabled')).toBeNull();
  expect(registry.getPackRegistration('failed')).toBeNull();
});

it('retains accepted declarations and reports a malformed replacement instead of silently removing settings', () => {
  const dir = install('memo-pack', 'Accepted');
  const registry = createNativePackTestRegistry();
  registry.refreshCatalog(packsDir, new Set());
  const previous = registry.settingsCatalog();
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.manifest), '{ broken');
  registry.refreshCatalog(packsDir, new Set());
  expect(registry.settingsCatalog()).toBe(previous);
  expect(registry.settingsCatalog().packs['memo-pack'].assistant.defaults).toEqual({ name: 'Accepted' });
  expect(registry.loadProblem('memo-pack')).toContain('declarations were refused');
  install('memo-pack', 'Rebuilt');
  registry.refreshCatalog(packsDir, new Set());
  expect(registry.settingsCatalog().packs['memo-pack'].assistant.defaults).toEqual({ name: 'Rebuilt' });
  expect(registry.loadProblem('memo-pack')).toBeUndefined();
});

it('publishes removal only after the installed directory is gone', () => {
  const dir = install('memo-pack');
  const registry = createNativePackTestRegistry();
  registry.refreshCatalog(packsDir, new Set());
  fs.rmSync(dir, { recursive: true });
  registry.refreshCatalog(packsDir, new Set());
  expect(registry.settingsCatalog().features).toEqual({});
  expect(registry.settingsCatalog().packs).toEqual({});
});

it('refuses invalid native declarations atomically and retains other contributions', () => {
  const registry = createNativePackTestRegistry();
  registry.registerPack({ id: 'accepted', features: { memos: { settings: definition } } });
  const previous = registry.settingsCatalog();
  expect(() => registry.registerPack({ id: 'bad-pack', features: { memos: { settings: { ...definition, defaults: { name: 1 } } } } })).toThrow('features.memos.settings.defaults.name: must be string');
  expect(registry.settingsCatalog()).toBe(previous);
  expect(registry.getPackRegistration('accepted')).not.toBeNull();
  expect(registry.getPackRegistration('bad-pack')).toBeNull();
});
