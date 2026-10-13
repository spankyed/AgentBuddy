import { expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { _createFeSettings, type PackFERegistration, type SettingsPort } from '@apackdev/sdk/fe';
import { fakeSettings } from '@apackdev/sdk/testing';
import { createFePackRegistry } from '../../src/fe/pack-store.ts';

const target = { kind: 'feature', featureRef: 'owner/code' } as const;
const registration = (bindSettings: PackFERegistration['bindSettings']): PackFERegistration => ({
  id: 'owner', features: { code: { designation: 'editor' } }, bindSettings,
});

it('binds the supplied port at registration and revokes retained handles and transport on unload', async () => {
  const packs = createFePackRegistry();
  const generated = _createFeSettings();
  const port = fakeSettings({ features: { 'owner/code': { limit: 1 } } });
  const dispose = vi.fn();
  packs.registerPackFE(registration(generated.bindSettings), { port, dispose });
  const scope = effectScope();
  const handle = scope.run(() => generated.useSettings<{ limit: number }>(target))!;
  await handle.set({ path: ['limit'], value: 2 });
  expect(port.get(target)).toEqual({ limit: 2 });
  packs.unregisterPackFE('owner');
  expect((await handle.set({ path: ['limit'], value: 3 })).status).toBe('refused');
  expect((await handle.reset()).status).toBe('refused');
  expect(dispose).toHaveBeenCalledOnce();
  packs.unregisterPackFE('owner');
  expect(dispose).toHaveBeenCalledOnce();
  scope.stop();
});

it('refuses a generated frontend without scoped authority and rolls its contributions back', () => {
  const packs = createFePackRegistry();
  const generated = _createFeSettings();
  expect(() => packs.registerPackFE(registration(generated.bindSettings))).toThrow('requires host-bound settings');
  expect(packs.designation('editor')).toBeUndefined();
  const scope = effectScope();
  expect(() => scope.run(() => generated.useSettings(target))).toThrow('before host acceptance');
  scope.stop();
});

it('does not bind a refused contribution and releases its provisional transport', () => {
  const packs = createFePackRegistry();
  packs.registerPackFE({ id: 'existing', features: { main: { designation: 'editor' } } });
  const bindSettings = vi.fn();
  const dispose = vi.fn();
  expect(() => packs.registerPackFE(registration(bindSettings), { port: {} as SettingsPort, dispose })).toThrow('Designation collision');
  expect(bindSettings).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
  expect(packs.designation('editor')).toBe('existing/main');
});

it('rolls back all contributions and disposes transport when binding refuses acceptance', () => {
  const packs = createFePackRegistry();
  const dispose = vi.fn();
  expect(() => packs.registerPackFE(registration(() => { throw new Error('stale runtime'); }),
    { port: {} as SettingsPort, dispose })).toThrow('stale runtime');
  expect(packs.designation('editor')).toBeUndefined();
  expect(dispose).toHaveBeenCalledOnce();
});

it('releases a refused duplicate without revoking the existing frontend', () => {
  const packs = createFePackRegistry();
  const existingRevoke = vi.fn();
  packs.registerPackFE(registration(() => ({ activate() {}, dispose: existingRevoke })), { port: {} as SettingsPort, dispose: vi.fn() });
  const dispose = vi.fn();
  expect(() => packs.registerPackFE(registration(vi.fn()), { port: {} as SettingsPort, dispose })).toThrow('already registered');
  expect(dispose).toHaveBeenCalledOnce();
  expect(existingRevoke).not.toHaveBeenCalled();
});


it('stages and discards a cached module replacement without changing its accepted accessor', async () => {
  const packs = createFePackRegistry();
  const generated = _createFeSettings();
  const first = fakeSettings({ features: { 'owner/code': { limit: 1 } } });
  const dispose = vi.fn();
  const reg = registration(generated.bindSettings);
  packs.registerPackFE(reg, { port: first, dispose });
  const second = fakeSettings({ features: { 'owner/code': { limit: 10 } } });
  const candidate = packs.preparePackFE(reg, { port: second, dispose: vi.fn() }, true);
  const scope = effectScope();
  const handle = scope.run(() => generated.useSettings<{ limit: number }>(target))!;
  expect(handle.value.value).toEqual({ limit: 1 });
  candidate.dispose();
  await handle.set({ path: ['limit'], value: 2 });
  expect(first.get(target)).toEqual({ limit: 2 });
  expect(second.updates).toEqual([]);
  expect(dispose).not.toHaveBeenCalled();
  scope.stop();
  packs.unregisterPackFE('owner');
});

it('restores the cached module accessor when a prepared host commit refuses publication', () => {
  const packs = createFePackRegistry();
  const generated = _createFeSettings();
  const reg = registration(generated.bindSettings);
  const dispose = vi.fn();
  packs.registerPackFE(reg, { port: fakeSettings({ features: { 'owner/code': { limit: 1 } } }), dispose });
  const candidate = packs.preparePackFE(reg, { port: fakeSettings({ features: { 'owner/code': { limit: 10 } } }), dispose: vi.fn() }, true);
  expect(() => candidate.commit(() => { throw new Error('publication refused'); })).toThrow('publication refused');
  const scope = effectScope();
  const handle = scope.run(() => generated.useSettings<{ limit: number }>(target))!;
  expect(handle.value.value).toEqual({ limit: 1 });
  expect(dispose).not.toHaveBeenCalled();
  scope.stop();
  packs.unregisterPackFE('owner');
});

it('rebinds a cached module repeatedly without reviving old handles or clearing the new accessor', async () => {
  const packs = createFePackRegistry();
  const generated = _createFeSettings();
  const reg = registration(generated.bindSettings);
  const first = fakeSettings({ features: { 'owner/code': { limit: 1 } } });
  packs.registerPackFE(reg, { port: first, dispose: vi.fn() });
  const scope = effectScope();
  const old = scope.run(() => generated.useSettings<{ limit: number }>(target))!;
  for (const limit of [10, 20]) {
    const source = fakeSettings({ features: { 'owner/code': { limit } } });
    packs.replacePackFE(reg, { port: source, dispose: vi.fn() });
    const current = scope.run(() => generated.useSettings<{ limit: number }>(target))!;
    expect(current.value.value).toEqual({ limit });
    expect((await old.set({ path: ['limit'], value: 99 })).status).toBe('refused');
    await current.set({ path: ['limit'], value: limit + 1 });
    expect(source.get(target)).toEqual({ limit: limit + 1 });
  }
  expect(first.updates).toEqual([]);
  scope.stop();
  packs.unregisterPackFE('owner');
});
