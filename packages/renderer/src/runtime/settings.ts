// The renderer's side of the SDK's settings port: what frontend code reads and changes of the app's settings,
// over the Settings view the app draws (`views/settings/`).
import type { SettingsPort, SettingsSaveStatus, SettingsTarget } from '@apack/sdk/fe';
import type { FeatureRef } from '@apack/sdk/ids';
import { boundFeHost } from '@apack/sdk/runtime/internals';
import { HOST } from '@apack/host/fe';

/** The settings view's actor, or undefined before its plugin is spawned (the window is still starting) */
function view() {
  return boundFeHost().application.system.get(HOST.settings);
}

/** The settings in effect, as the view holds them; an empty document until it has them */
const document = (): Record<string, unknown> =>
  (view()?.getSnapshot()?.context?.settings ?? {}) as Record<string, unknown>;

export const settingsPort: SettingsPort = {
  section: <T,>(name: string) => document()[name] as T | undefined,

  feature: <T,>(ref: FeatureRef) => (document().plugins as Record<string, unknown> | undefined)?.[ref] as T | undefined,

  saveStatus: (): SettingsSaveStatus =>
    (view()?.getSnapshot()?.context?.save as SettingsSaveStatus | undefined) ?? { status: 'idle', problems: [] },

  subscribe(listener) {
    const actor = view();
    if (!actor) return () => {};
    const subscription = actor.subscribe(() => listener());
    return () => subscription.unsubscribe();
  },

  update(target: SettingsTarget, path, value) {
    view()?.send({ type: 'SETTINGS.UPDATE', ...addressed(target), path: [...path], value });
  },

  reset(target) {
    view()?.send({ type: 'SETTINGS.RESET', ...(target && { target: addressed(target) }) });
  },
};

/** The view's own event shape: a section by its name, a feature by its ref */
function addressed(target: SettingsTarget): { entityType: 'section' | 'plugin'; label: string } {
  return 'section' in target
    ? { entityType: 'section', label: target.section }
    : { entityType: 'plugin', label: target.feature };
}
