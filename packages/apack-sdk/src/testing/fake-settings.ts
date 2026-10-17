import { hasOwn } from '../utils/shared.ts';
// In-memory settings port for component tests; no Settings view is required.
import type { SettingsPort, SettingsTarget } from '../fe/settings.ts';
import type { SettingsWriteResult } from '../types/index.ts';
import { settingsTargetPath } from '../types/index.ts';

/** A change a component made through the port */
export interface FakeSettingsUpdate {
  target: SettingsTarget;
  path: readonly string[];
  value: unknown;
}

/** A reset of one explicit target. */
export interface FakeSettingsReset {
  target: SettingsTarget;
}

export interface FakeSettings extends SettingsPort {
  /** Every change made through the port, in the order they were made */
  readonly updates: readonly FakeSettingsUpdate[];
  /** Every reset asked for through the port, in order */
  readonly resets: readonly FakeSettingsReset[];
  /** Makes `document` the settings in effect and tells whoever is following them */
  set(document: Record<string, unknown>): void;
  /** What the last change was answered with; `saved` unless a test says otherwise */
  answer(result: SettingsWriteResult): void;
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
 * A `SettingsPort` over an in-memory document, for a test that renders a component using `useAppSettings`,
 * `useFeatureSettings` or an explicitly injected `useSettingsSave(settings)`:
 *
 *     const settings = fakeSettings({ app: { projects: [] }, features: {} });
 *     afterAll(startFeTestRuntime({ settings }));
 *
 * A change reaches the document it holds, so what a component writes is what the next read returns, and `updates`
 * records each one as it was addressed.
 */
export function fakeSettings(document: Record<string, unknown> = {}): FakeSettings {
  let doc = { features: {}, ...document } as Record<string, unknown>;
  let answer: SettingsWriteResult = { status: 'saved' };
  const updates: FakeSettingsUpdate[] = [];
  const resets: FakeSettingsReset[] = [];
  const listeners = new Set<() => void>();
  const tell = () => { for (const listener of listeners) listener(); };

  return {
    updates,
    resets,
    get: <T,>(target: SettingsTarget) => settingsTargetPath(target).reduce<unknown>((value, key) =>
      value && typeof value === 'object' && hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined,
      doc) as T | undefined,
    status: () => 'ready',
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(target, path, value) {
      updates.push({ target, path: [...path], value });
      if (answer.status === 'refused') return Promise.resolve(answer);
      const at = [...settingsTargetPath(target), ...path];
      doc = setIn(doc, at, value);
      tell();
      return Promise.resolve(answer);
    },
    // No defaults are held here: reset removes the addressed test value.
    reset(target) {
      resets.push({ target });
      if (answer.status === 'refused') return Promise.resolve(answer);
      const remove = (value: Record<string, unknown>, path: readonly string[]): Record<string, unknown> => {
        const [key, ...rest] = path;
        if (!hasOwn(value, key)) return value;
        if (rest.length === 0) return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
        const child = value[key];
        return child && typeof child === 'object' ? { ...value, [key]: remove(child as Record<string, unknown>, rest) } : value;
      };
      doc = remove(doc, settingsTargetPath(target));
      tell();
      return Promise.resolve(answer);
    },
    set(next) {
      doc = { features: {}, ...next };
      tell();
    },
    answer(status) {
      answer = status;
    },
  };
}
