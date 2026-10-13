import { expect, it, vi } from 'vitest';
import { _settingsHandle } from '../../src/services/settings-handle.ts';
import type { SettingsService } from '../../src/services/settings.ts';
import type { SettingsTarget } from '../../src/types/settings.ts';

it.each<SettingsTarget>([
  { kind: 'app' },
  { kind: 'pack', packId: 'examples', groupId: 'assistant' },
  { kind: 'feature', featureRef: 'examples/code' as import('../../src/ids/index.ts').FeatureRef },
])('keeps reads, writes and reset bound to %j', (target) => {
  const service: SettingsService = {
    get: vi.fn(() => ({ name: 'Ada' })) as SettingsService['get'],
    set: vi.fn(), reset: vi.fn(), onChange: vi.fn(),
  };
  const handle = _settingsHandle<{ name: string }>(target, service);
  expect(handle.get()).toEqual({ name: 'Ada' });
  expect(service.get).toHaveBeenCalledWith(target);
  handle.set({ path: ['name'], value: 'Grace' });
  expect(service.set).toHaveBeenCalledWith(target, ['name'], 'Grace', undefined);
  handle.reset();
  expect(service.reset).toHaveBeenCalledWith(target);
});

it('reads its target on invalidation and releases its subscription', () => {
  const target = { kind: 'pack', packId: 'examples', groupId: 'assistant' } as const;
  let value = { name: 'Ada' };
  let invalidate: (() => void) | undefined;
  const stop = vi.fn();
  const service: SettingsService = {
    get: vi.fn(() => value) as SettingsService['get'], set: vi.fn(), reset: vi.fn(),
    onChange: listener => { invalidate = () => listener('written'); return stop; },
  };
  const listener = vi.fn();
  const handle = _settingsHandle<{ name: string }>(target, service);
  const unsubscribe = handle.onChange(listener);
  value = { name: 'Grace' };
  invalidate!();
  expect(service.get).toHaveBeenCalledWith(target);
  expect(listener).toHaveBeenCalledWith({ name: 'Grace' });
  unsubscribe();
  expect(stop).toHaveBeenCalledOnce();
});
