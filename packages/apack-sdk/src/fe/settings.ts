// Reactive access to host, pack and feature preferences through the window settings runtime.
import { getCurrentScope, onScopeDispose, readonly, ref, toRaw, type Ref } from 'vue'
import { boundFeHost } from '../runtime/fe-host.ts'
import type { AppSettings, SettingsTarget, SettingsWriteCondition, SettingsWriteResult } from '../types/index.ts'
export type { SettingsTarget, SettingUpdate } from '../types/index.ts'
import type { FeatureRef } from '../ids/index.ts'

/** Whether the last change reached the store, and why it didn't */
export interface SettingsSaveStatus {
  status: 'idle' | 'saving' | 'saved' | 'refused';
  problems: readonly string[];
}

/** The renderer binds one settings port per window, independently of the Settings view. */
export interface SettingsPort {
  get<T = unknown>(target: SettingsTarget): T | undefined;
  status(): 'loading' | 'ready' | 'replacing' | 'disconnected' | 'disposed';
  /** Calls `listener` whenever any of the above may have changed; returns the unsubscribe */
  subscribe(listener: () => void): () => void;
  /** Sets a relative path within an explicit owner. */
  update(target: SettingsTarget, path: readonly string[], value: unknown, condition?: SettingsWriteCondition): Promise<SettingsWriteResult>;
  reset(target: SettingsTarget): Promise<SettingsWriteResult>;

}

const port = (): SettingsPort => boundFeHost().settings;

/** Vue drafts may contain nested proxies; preserve their data without JSON's lossy conversions. */
function settingsData(value: unknown, copies = new WeakMap<object, object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  const raw = toRaw(value);
  const prototype = Object.getPrototypeOf(raw);
  if (!Array.isArray(raw) && prototype !== Object.prototype && prototype !== null) return raw;
  const previous = copies.get(raw);
  if (previous) return previous;
  const copy: object = Array.isArray(raw) ? [] : Object.create(prototype);
  copies.set(raw, copy);
  for (const key of Reflect.ownKeys(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)!;
    if ('value' in descriptor) descriptor.value = settingsData(descriptor.value, copies);
    Object.defineProperty(copy, key, descriptor);
  }
  return copy;
}

function updateSettings(writer: Pick<SettingsPort, 'update'>, target: SettingsTarget,
  path: readonly string[], value: unknown, condition?: SettingsWriteCondition): Promise<SettingsWriteResult> {
  try {
    return writer.update(target, path, settingsData(value),
      condition === undefined ? undefined : settingsData(condition) as SettingsWriteCondition);
  } catch (error) {
    return Promise.resolve({ status: 'refused', problems: [String(error)] });
  }
}

/** A ref that follows the settings until the calling scope is disposed; throws outside one, as `useShell` does */
function following<T>(read: () => T, source: Pick<SettingsPort, 'subscribe'> = port()): Readonly<Ref<T>> {
  if (!getCurrentScope()) throw new Error('useSettings…() runs in a component or an effect scope: it follows the settings until the scope is disposed');
  const value = ref(read()) as Ref<T>;
  const stop = source.subscribe(() => { value.value = read(); });
  onScopeDispose(stop);
  return readonly(value) as Readonly<Ref<T>>;
}

/** App preferences are host-owned and always have one known target. */
export function useAppSettings(): Readonly<Ref<AppSettings | undefined>> {
  return following(() => port().get<AppSettings>({ kind: 'app' }));
}

export function useFeatureSettings<T = unknown>(feature: FeatureRef): Readonly<Ref<T | undefined>> {
  return following(() => port().get<T>({ kind: 'feature', featureRef: feature }));
}

export function usePackSettings<T = unknown>(packId: string, groupId: string): Readonly<Ref<T | undefined>> {
  return following(() => port().get<T>({ kind: 'pack', packId, groupId }));
}

/**
 * Whether the last change was stored, with the store's reasons when it wasn't, and the one way to make one. A form
 * says "Saved" only for a change the store stored.
 */
export function useSettingsSave(writer: Pick<SettingsPort, 'update' | 'reset'>): {
  save: Readonly<Ref<SettingsSaveStatus>>;
  update: SettingsPort['update'];
  reset: SettingsPort['reset'];
} {
  if (!getCurrentScope()) throw new Error('useSettingsSave() runs in a component or an effect scope');
  const save = ref<SettingsSaveStatus>({ status: 'idle', problems: [] });
  let latest = 0;
  let disposed = false;
  onScopeDispose(() => { disposed = true; });
  async function perform(write: () => Promise<SettingsWriteResult>): Promise<SettingsWriteResult> {
    const request = ++latest;
    save.value = { status: 'saving', problems: [] };
    let result: SettingsWriteResult;
    try { result = await write(); }
    catch (error) { result = { status: 'refused', problems: [String(error)] }; }
    if (!disposed && latest === request) save.value = { ...result, problems: result.status === 'refused' ? result.problems : [] };
    return result;
  }
  return {
    save: readonly(save),
    update: (target, path, value, condition) => perform(() => updateSettings(writer, target, path, value, condition)),
    reset: target => perform(() => writer.reset(target)),
  };
}

/** Distinguishes startup/reconnection from missing owner values. */
export function useSettingsStatus(): Readonly<Ref<ReturnType<SettingsPort['status']>>> {
  return following(() => port().status());
}

/** Reactive reads remain available when a declaration restricts dependency mutations. */
export interface ReadonlyFeSettingsHandle<T> {
  value: Readonly<Ref<T | undefined>>;
}

export interface FeSettingsHandle<T> extends ReadonlyFeSettingsHandle<T> {
  set(update: import('../types/settings.ts').SettingUpdate<T>): Promise<SettingsWriteResult>;
  reset(): Promise<SettingsWriteResult>;
}

/** @internal Generated frontends publish prepared bindings only when the host activates them. */
export function _createFeSettings() {
  type Binding = { port: SettingsPort; active: boolean; subscriptions: Set<() => void>; previous?: Binding };
  let current: Binding | undefined;
  return {
    bindSettings(source: SettingsPort): { activate(): void; dispose(): void } {
      const binding: Binding = { port: source, active: false, subscriptions: new Set() };
      let state: 'pending' | 'active' | 'disposed' = 'pending';
      return {
        activate() {
          if (state !== 'pending') throw new Error('Only pending frontend settings may activate');
          binding.previous = current;
          current = binding;
          binding.active = true;
          state = 'active';
        },
        dispose() {
          if (state === 'disposed') return;
          state = 'disposed';
          binding.active = false;
          // Failed host publication can restore a still-active incumbent. Retirement cannot revive it.
          if (current === binding) current = binding.previous?.active ? binding.previous : undefined;
          else if (current?.previous === binding) current.previous = undefined;
          binding.previous = undefined;
          const errors: unknown[] = [];
          for (const stop of binding.subscriptions) {
            try { stop(); }
            catch (error) { errors.push(error); }
          }
          if (errors.length) throw new AggregateError(errors, 'Frontend settings subscriptions could not be disposed');
        },
      };
    },
    useSettings<T>(target: SettingsTarget): FeSettingsHandle<T> {
      const binding = current;
      if (!binding) throw new Error('Frontend settings are unavailable before host acceptance or after unload');
      const active = (): boolean => binding.active;
      const unavailable = (): Promise<SettingsWriteResult> => Promise.resolve({ status: 'refused', problems: ['This frontend settings binding was unloaded.'] });
      const source: Pick<SettingsPort, 'subscribe'> = {
        subscribe(listener) {
          const stop = binding.port.subscribe(() => { if (active()) listener(); });
          const unsubscribe = () => { if (binding.subscriptions.delete(unsubscribe)) stop(); };
          binding.subscriptions.add(unsubscribe);
          return unsubscribe;
        },
      };
      return {
        value: following(() => active() ? binding.port.get<T>(target) : undefined, source),
        set: ({ path, value, condition }) => active() ? updateSettings(binding.port, target, path, value, condition) : unavailable(),
        reset: () => active() ? binding.port.reset(target) : unavailable(),
      };
    },
  };
}
