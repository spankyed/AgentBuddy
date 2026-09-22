import { boundHost } from '../runtime/host-runtime.ts';
import { isPlainObject } from '../utils/shared.ts';

/**
 * A feature's default settings (abuddy.json `features[].settings`): its plugin's slice under
 * `plugins.<feature id>`, and whether its sidebar tab shows by default (`visible`, shown when omitted).
 */
export interface FeatureSettings {
  plugins?: Record<string, unknown>;
  visible?: boolean;
}

/**
 * Every registered pack's feature settings, merged, each under its plugin's ref: the plugin slices and the
 * sidebar visibility the features declare. `revision` changes whenever a pack registers or unregisters.
 */
export interface PackSettingsDefaults {
  revision: number;
  settings: { plugins: Record<string, unknown> };
  visibility: Record<string, boolean>;
}

/**
 * Problems with a feature's settings: a feature sets only its own plugin's slice and whether its tab shows,
 * so a pack can't change the app's or another plugin's defaults.
 */
export function checkFeatureSettings(featureId: string, settings: unknown): string[] {
  const where = `Feature "${featureId}" settings`;
  if (!isPlainObject(settings)) return [`${where} must default-export an object`];
  const problems = Object.keys(settings).filter((key) => key !== 'plugins' && key !== 'visible')
    .map((key) => `${where} set "${key}"; only "plugins.${featureId}" and "visible" are allowed`);
  if (settings.visible !== undefined && typeof settings.visible !== 'boolean') problems.push(`${where}: "visible" must be true or false`);
  const { plugins } = settings;
  if (plugins === undefined) return problems;
  if (!isPlainObject(plugins)) return [...problems, `${where}: "plugins" must be an object`];
  for (const key of Object.keys(plugins)) {
    if (key !== featureId) problems.push(`${where} set "plugins.${key}"; a feature sets only its own plugin's settings, "plugins.${featureId}"`);
  }
  return problems;
}

/** The default settings registered packs' features declare (the bound app's registered packs) */
export function getPackSettingsDefaults(): PackSettingsDefaults {
  return boundHost().packs.settingsDefaults();
}

/** Calls `listener` whenever a pack's feature settings are registered or unregistered; returns the unsubscribe */
export function onPackSettingsDefaultsChanged(listener: () => void): () => void {
  return boundHost().packs.onSettingsDefaultsChanged(listener);
}
