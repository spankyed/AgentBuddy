// The settings a pack's component test reads and writes. The real port is the renderer's, over the running Settings
// view; this one holds a document in memory, so a test can say what the settings are and see what a component changed
// without an app.
import type { SettingsPort, SettingsSaveStatus, SettingsTarget } from '../fe/settings.ts';
import type { FeatureRef } from '../ids/index.ts';

/** A change a component made through the port */
export interface FakeSettingsUpdate {
  target: SettingsTarget;
  path: readonly string[];
  value: unknown;
}

export interface FakeSettings extends SettingsPort {
  /** Every change made through the port, in the order they were made */
  readonly updates: readonly FakeSettingsUpdate[];
  /** Makes `document` the settings in effect and tells whoever is following them */
  set(document: Record<string, unknown>): void;
  /** What the last change was answered with; `saved` unless a test says otherwise */
  answer(status: SettingsSaveStatus): void;
}

/** Sets `value` at `path`, copying only the objects along it and taking every key as data */
function setIn(node: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown> {
  if (path.length === 0) return value as Record<string, unknown>;
  const [key, ...rest] = path;
  const child = node[key];
  const next = { ...node };
  Object.defineProperty(next, key, {
    value: setIn(typeof child === 'object' && child !== null ? { ...(child as Record<string, unknown>) } : {}, rest, value),
    writable: true, enumerable: true, configurable: true,
  });
  return next;
}

/**
 * A `SettingsPort` over an in-memory document, for a test that renders a component using `useSettingsSection`,
 * `useFeatureSettings`, `useSettingsSave` or `updateSettings`:
 *
 *     const settings = fakeSettings({ general: { projects: [] }, plugins: {} });
 *     afterAll(startFeTestRuntime({ settings }));
 *
 * A change reaches the document it holds, so what a component writes is what the next read returns, and `updates`
 * records each one as it was addressed.
 */
export function fakeSettings(document: Record<string, unknown> = {}): FakeSettings {
  let doc = { plugins: {}, ...document } as Record<string, unknown>;
  let save: SettingsSaveStatus = { status: 'idle', problems: [] };
  const updates: FakeSettingsUpdate[] = [];
  const listeners = new Set<() => void>();
  const tell = () => { for (const listener of listeners) listener(); };

  return {
    updates,
    section: <T,>(name: string) => doc[name] as T | undefined,
    feature: <T,>(ref: FeatureRef) => (doc.plugins as Record<string, unknown> | undefined)?.[ref] as T | undefined,
    saveStatus: () => save,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(target, path, value) {
      updates.push({ target, path: [...path], value });
      const at = 'section' in target ? [target.section, ...path] : ['plugins', target.feature, ...path];
      doc = setIn(doc, at, value);
      save = { status: 'saved', problems: [] };
      tell();
    },
    set(next) {
      doc = { plugins: {}, ...next };
      tell();
    },
    answer(status) {
      save = status;
      tell();
    },
  };
}
