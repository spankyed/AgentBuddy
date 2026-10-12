import { expect, it, vi } from 'vitest';
import { _featureSettings } from '../../src/services/feature-settings.ts';
import type { FeatureRef } from '../../src/ids/index.ts';
import type { SettingsService } from '../../src/services/settings.ts';

const feature = 'demo/notes' as FeatureRef;

it('delegates writes and removes overrides on reset, without persisting defaults', () => {
  const service = {
    forFeature: vi.fn(() => ({ enabled: true })),
    setForFeature: vi.fn(),
    removeStored: vi.fn(),
  } as unknown as SettingsService;
  const settings = _featureSettings<{ enabled: boolean }>(feature, () => service);
  expect(settings.get()).toEqual({ enabled: true });
  settings.set({ path: ['enabled'], value: false });
  expect(service.setForFeature).toHaveBeenCalledWith(feature, ['enabled'], false);
  settings.reset();
  expect(service.removeStored).toHaveBeenCalledWith(['features', feature]);
});

it('preserves store refusals and refuses to reset an unregistered feature', () => {
  const refusal = new Error('unregistered feature');
  const service = {
    forFeature: vi.fn(() => { throw refusal; }),
    setForFeature: vi.fn(() => { throw refusal; }),
    removeStored: vi.fn(),
  } as unknown as SettingsService;
  const settings = _featureSettings<{ enabled: boolean }>(feature, () => service);
  expect(() => settings.set({ path: ['enabled'], value: false })).toThrow(refusal);
  expect(() => settings.reset()).toThrow(refusal);
  expect(service.removeStored).not.toHaveBeenCalled();
});


it('can declare a handle before the host binds its services', () => {
  const read = vi.fn(() => { throw new Error('host not bound'); });
  const settings = _featureSettings<{ enabled: boolean }>(feature, read);
  expect(read).not.toHaveBeenCalled();
  expect(() => settings.get()).toThrow('host not bound');
});
