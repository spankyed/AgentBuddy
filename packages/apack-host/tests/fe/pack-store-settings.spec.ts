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
  packs.registerPackFE(registration(() => existingRevoke), { port: {} as SettingsPort, dispose: vi.fn() });
  const dispose = vi.fn();
  expect(() => packs.registerPackFE(registration(vi.fn()), { port: {} as SettingsPort, dispose })).toThrow('already registered');
  expect(dispose).toHaveBeenCalledOnce();
  expect(existingRevoke).not.toHaveBeenCalled();
});
