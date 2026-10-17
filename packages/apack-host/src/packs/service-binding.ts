import { _captureHostServices, type SettingsService, type PackServiceAccess } from '@apackdev/sdk/services';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import type { SettingsTarget } from '@apackdev/sdk/types';
import type { _packServiceSelection } from '@apackdev/sdk/framework';

type Selection = ReturnType<typeof _packServiceSelection>;
interface ProviderService {
  readonly generation: object;
  readonly value: unknown;
}

/** One admitted caller owns authority and subscriptions, including when its generated hook misbehaves. */
export function createPackServiceBinding({ caller, selection, settings, provider, overrides, bind }: {
  caller: string;
  selection: Selection;
  settings: SettingsService;
  overrides?: ReadonlyMap<string, unknown>;
  provider: (packId: string, name: string) => ProviderService | undefined;
  bind: (access: PackServiceAccess) => () => void;
}) {
  const host = _captureHostServices();
  let status: 'pending' | 'active' | 'revoked' = 'pending';
  const subscriptions = new Set<() => void>();
  const live = () => status === 'active' && host.current();
  const assertCaller = () => {
    if (!live()) throw new Error(`Pack "${caller}" services ${status === 'pending' ? 'are unavailable until the host accepts this runtime' : status === 'revoked' ? 'have been revoked' : 'belong to a retired runtime or host'}`);
  };
  const scopedSettings: SettingsService = {
    get<T>(target: SettingsTarget) { assertCaller(); return settings.get<T>(target); },
    set(target, path, value, condition) { assertCaller(); settings.set(target, path, value, condition); },
    reset(target) { assertCaller(); settings.reset(target); },
    onChange(listener) {
      assertCaller();
      const stop = settings.onChange(change => { if (live()) listener(change); });
      const unsubscribe = () => { if (subscriptions.delete(unsubscribe)) stop(); };
      if (live()) subscriptions.add(unsubscribe); else stop();
      return unsubscribe;
    },
  };

  // Fresh proxy targets preserve frozen provider objects; calls retain the provider's private receiver.
  const guard = (value: unknown, check: () => void, inference = false, cache = new WeakMap<object, unknown>()): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (cache.has(value)) return cache.get(value);
    const methods = new Map<PropertyKey, { source: unknown; bound: (...args: unknown[]) => unknown }>();
    const member = (key: PropertyKey) => {
      check();
      const result = Reflect.get(value, key, value);
      if (typeof result !== 'function') return guard(result, check, false, cache);
      const previous = methods.get(key);
      if (previous && previous.source === result) return previous.bound;
      const bound = (...args: unknown[]) => {
        check();
        const output = Reflect.apply(result, value, args);
        // Agent methods start new model calls. Started calls/streams may settle on their original implementation.
        return inference && key === 'createAgent'
          ? Promise.resolve(output).then(agent => guard(agent, check)) : output;
      };
      methods.set(key, { source: result, bound });
      return bound;
    };
    const facade = new Proxy(Object.create(null), {
      // Promise assimilation must be able to deliver a non-thenable, already-retired agent.
      get: (_, key) => key === 'then' && !Reflect.has(value, key) ? undefined : member(key),
      has(_, key) { check(); return Reflect.has(value, key); },
      ownKeys() { check(); return Reflect.ownKeys(value); },
      getOwnPropertyDescriptor(_, key) {
        check();
        const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
        return descriptor && { configurable: true, enumerable: descriptor.enumerable, value: member(key), writable: 'writable' in descriptor ? descriptor.writable : false };
      },
      set(_, key, next) { check(); return Reflect.set(value, key, next, value); },
    });
    cache.set(value, facade);
    return facade;
  };
  const createServices = (attributed?: ReturnType<typeof host.forAction>) => {
    const resolve = (packId: string, name: string): ProviderService | undefined => {
      const source = packId === 'host' ? { generation: host, value: attributed && Object.hasOwn(attributed, name) ? Reflect.get(attributed, name) : host.get(name) } : provider(packId, name);
      return source && { generation: source.generation, value: overrides?.has(name) ? overrides.get(name) : source.value };
    };
    const supplied = Object.create(null) as Record<string, unknown>;
    const handles = new Map<string, { generation: object; value: unknown; facade: unknown }>();
    for (const { packId, name, ref } of selection) {
      Object.defineProperty(supplied, name, { enumerable: true, get() {
        assertCaller();
        if (packId === 'host' && name === 'settings') return scopedSettings;
        const source = resolve(packId, name);
        if (!source || source.value === undefined) throw new Error(`Pack "${caller}" consumes "${ref}", but provider "${packId}" is not ready`);
        const cached = handles.get(ref);
        if (cached?.generation === source.generation && cached.value === source.value) return cached.facade;
        const check = () => {
          assertCaller();
          const next = resolve(packId, name);
          if (!next || next.generation !== source.generation || next.value !== source.value) {
            throw new Error(`Pack "${caller}" service "${ref}" belongs to a retired provider runtime`);
          }
        };
        const facade = guard(source.value, check, ref === 'host/inference');
        handles.set(ref, { ...source, facade });
        return facade;
      } });
    }
    return Object.freeze(supplied);
  };
  const revoke = (): string[] => {
    status = 'revoked';
    const failures: string[] = [];
    for (const stop of subscriptions) {
      try { stop(); } catch (error) { failures.push(errorMessage(error)); }
    }
    return failures;
  };
  let cleanup: () => void;
  try {
    cleanup = bind(Object.freeze({ services: createServices(), servicesForAction(label: string) {
      assertCaller();
      return createServices(host.forAction({ from: caller, via: `action:${label}` }));
    } }));
    if (typeof cleanup !== 'function') throw new Error('Pack service binding must return cleanup');
  } catch (error) { revoke(); throw error; }
  return {
    activate(): void {
      if (status !== 'pending') throw new Error('Only a pending service binding can be accepted');
      status = 'active';
    },
    dispose(): string[] {
      if (status === 'revoked') return [];
      const failures = revoke();
      try { cleanup(); } catch (error) { failures.push(errorMessage(error)); }
      return failures;
    },
  };
}
