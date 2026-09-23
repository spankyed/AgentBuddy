// The app's settings, as frontend code reads and changes them.
//
// Settings are the app's, not a pack's: the row, its defaults and its one writer are the host's, and the view that
// draws them is the app's too. This is what every other feature's frontend needs of them — its own settings, a
// registered section, and the one way to change either — without reaching into the settings view's actor.
//
// The backend counterpart is `services.settings`. The renderer binds the implementation with `bindFeHost`, as it
// binds `secrets`; nothing else of the settings view reaches the SDK.
import { getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue'
import { boundFeHost } from '../runtime/fe-host.ts'
import type { FeatureRef } from '../ids/index.ts'

/** Whether the last change reached the store, and why it didn't */
export interface SettingsSaveStatus {
  status: 'idle' | 'saving' | 'saved' | 'refused';
  problems: string[];
}

/** What a feature's settings change names: a registered section, or an installed feature's own slice */
export type SettingsTarget = { section: string } | { feature: FeatureRef };

/** The app's settings as the frontend port holds them; the renderer binds the running view's */
export interface SettingsPort {
  /** One registered section of the settings in effect */
  section<T = unknown>(name: string): T | undefined;
  /** A feature's own settings in effect */
  feature<T = unknown>(ref: FeatureRef): T | undefined;
  /** Whether the last change was stored */
  saveStatus(): SettingsSaveStatus;
  /** Calls `listener` whenever any of the above may have changed; returns the unsubscribe */
  subscribe(listener: () => void): () => void;
  /** Sets `value` at `path` in a section or a feature's slice */
  update(target: SettingsTarget, path: readonly string[], value: unknown): void;
}

const port = (): SettingsPort => boundFeHost().settings;

/** A ref that follows the settings until the calling scope is disposed; throws outside one, as `useShell` does */
function following<T>(read: () => T): Readonly<Ref<T>> {
  if (!getCurrentScope()) throw new Error('useSettings…() runs in a component or an effect scope: it follows the settings until the scope is disposed');
  const value = ref(read()) as Ref<T>;
  const stop = port().subscribe(() => { value.value = read(); });
  onScopeDispose(stop);
  return readonly(value) as Readonly<Ref<T>>;
}

/** One registered section of the settings in effect, following changes to it */
export function useSettingsSection<T = unknown>(name: string): Readonly<Ref<T | undefined>> {
  return following(() => port().section<T>(name));
}

/** A feature's own settings in effect, following changes to them */
export function useFeatureSettings<T = unknown>(feature: FeatureRef): Readonly<Ref<T | undefined>> {
  return following(() => port().feature<T>(feature));
}

/**
 * Whether the last change was stored, with the store's reasons when it wasn't, and the one way to make one. A form
 * says "Saved" only for a change the store stored.
 */
export function useSettingsSave(): { save: Readonly<Ref<SettingsSaveStatus>>; update: SettingsPort['update'] } {
  return { save: following(() => port().saveStatus()), update: (target, path, value) => port().update(target, path, value) };
}

/** Changes a setting from outside a component (a machine's action), where nothing follows it */
export function updateSettings(target: SettingsTarget, path: readonly string[], value: unknown): void {
  port().update(target, path, value);
}

/** One registered section as it applies now, for code outside a component */
export function settingsSection<T = unknown>(name: string): T | undefined {
  return port().section<T>(name);
}
