import type { SettingsHandle, SettingsTarget } from '../types/settings.ts';
import type { SettingsService } from './settings.ts';

/** @internal Captures one caller-bound service lifetime and resolves the target once. */
export function _settingsHandle<T>(target: SettingsTarget, service: SettingsService): SettingsHandle<T> {
  return {
    get: () => service.get<T>(target),
    onChange: listener => service.onChange(() => listener(service.get<T>(target))),
    set: ({ path, value, condition }) => service.set(target, path, value, condition),
    reset: () => service.reset(target),
  };
}
