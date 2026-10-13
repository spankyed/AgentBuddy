import type { SettingsAdmin, SettingsService } from '@apackdev/sdk/services';
import type { SettingsTarget } from '@apackdev/sdk/types';
import type { SettingsStore } from '../features/settings/be/store.ts';

/** Pack services close over caller identity and expose no administrative methods. */
export function createSettingsService(store: SettingsStore): SettingsAdmin {
  const forPack = (packId: string): SettingsService => ({
    get: (target) => store.get(target, packId),
    set: (target, path, value, condition) => store.set(target, path, value, packId, condition),
    reset: (target) => store.reset(target, packId),
    onChange: store.onChange,
  });
  return {
    get: (target) => store.get(target),
    set: (target, path, value, condition) => store.set(target, path, value, undefined, condition),
    reset: (target) => store.reset(target),
    getAll: store.getAll,
    getSnapshot: store.getSnapshot,
    getOverrides: store.getOverrides,
    replaceAll: store.replaceAll,
    removeOverrides: store.removeOverrides,
    resetAll: store.resetAll,
    whileReplacingData: store.whileReplacingData,
    onChange: store.onChange,
    forPack,
  };
}

/** The host owns authority even if the generated binding hook throws or omits cleanup. */
export function createPackSettingsBinding(source: SettingsService, bind: (service: SettingsService) => () => void) {
  let status: 'pending' | 'active' | 'revoked' = 'pending';
  const subscriptions = new Set<() => void>();
  const assertActive = () => {
    if (status !== 'active') throw new Error(status === 'revoked'
      ? 'Pack settings binding has been revoked' : 'Pack settings are unavailable until the host accepts this runtime');
  };
  const service: SettingsService = {
    get<T>(target: SettingsTarget) { assertActive(); return source.get<T>(target); },
    set(target, path, value, condition) { assertActive(); source.set(target, path, value, condition); },
    reset(target) { assertActive(); source.reset(target); },
    onChange(listener) {
      assertActive();
      const stop = source.onChange(change => { if (status === 'active') listener(change); });
      const unsubscribe = () => { if (subscriptions.delete(unsubscribe)) stop(); };
      if (status === 'active') subscriptions.add(unsubscribe);
      else stop();
      return unsubscribe;
    },
  };
  const revoke = (): string[] => {
    status = 'revoked';
    const failures: string[] = [];
    for (const stop of subscriptions) {
      try { stop(); }
      catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    }
    return failures;
  };
  let cleanup: () => void;
  try {
    cleanup = bind(service);
    if (typeof cleanup !== 'function') throw new Error('Pack settings binding must return cleanup');
  } catch (error) {
    revoke();
    throw error;
  }
  return {
    activate(): void {
      if (status !== 'pending') throw new Error('Only a pending settings binding can be accepted');
      status = 'active';
    },
    dispose(): string[] {
      if (status === 'revoked') return [];
      const failures = revoke();
      try { cleanup(); }
      catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
      return failures;
    },
  };
}
