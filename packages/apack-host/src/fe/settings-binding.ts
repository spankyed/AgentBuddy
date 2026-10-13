import type { PackFERegistration, SettingsPort } from '@apackdev/sdk/fe';
import type { SettingsTarget } from '@apackdev/sdk/types';
import type { FrontendSettingsBinding } from './pack-store.ts';

/** Authority belongs to the host even when a generated hook retains a port or omits its cleanup. */
export function createFrontendSettingsBinding(source?: FrontendSettingsBinding) {
  let state: 'pending' | 'active' | 'revoked' = 'pending';
  let cleanup: (() => void) | undefined;
  const subscriptions = new Set<() => void>();
  const assertActive = () => {
    if (state !== 'active') throw new Error(state === 'revoked'
      ? 'Frontend settings binding has been revoked' : 'Frontend settings are unavailable before host acceptance');
  };
  const refusal = () => Promise.resolve({ status: 'refused' as const, problems: ['This frontend settings binding is unavailable.'] });
  const port: SettingsPort = {
    get<T>(target: SettingsTarget) { assertActive(); return source!.port.get<T>(target); },
    status: () => state === 'active' ? source!.port.status() : state === 'pending' ? 'loading' : 'disposed',
    update: (target, path, value, condition) => state === 'active' ? source!.port.update(target, path, value, condition) : refusal(),
    reset: target => state === 'active' ? source!.port.reset(target) : refusal(),
    subscribe(listener) {
      assertActive();
      const stop = source!.port.subscribe(() => { if (state === 'active') listener(); });
      const unsubscribe = () => { if (subscriptions.delete(unsubscribe)) stop(); };
      if (state === 'active') subscriptions.add(unsubscribe);
      else stop();
      return unsubscribe;
    },
  };
  return {
    bind(hook: PackFERegistration['bindSettings']): void {
      if (!hook) return;
      if (!source) throw new Error('Frontend requires host-bound settings access');
      cleanup = hook(port);
      if (typeof cleanup !== 'function') throw new Error('Frontend settings binding must return cleanup');
    },
    activate(): void {
      if (state !== 'pending') throw new Error('Only pending frontend settings may activate');
      state = 'active';
    },
    dispose(): unknown[] {
      if (state === 'revoked') return [];
      state = 'revoked';
      const errors: unknown[] = [];
      for (const stop of subscriptions) {
        try { stop(); } catch (error) { errors.push(error); }
      }
      try { cleanup?.(); } catch (error) { errors.push(error); }
      try { source?.dispose(); } catch (error) { errors.push(error); }
      return errors;
    },
  };
}
