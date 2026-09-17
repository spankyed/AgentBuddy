import { boundHost } from '../runtime/host-runtime.ts';

/**
 * A feature's default settings (abuddy.json `features[].settings`): its plugin's slice under
 * `plugins.<feature id>`, and whether its sidebar tab shows by default
 * (`plugins._meta.visibility.<feature id>`).
 */
export interface FeatureSettings {
  plugins?: Record<string, unknown>;
}

/** Every registered pack's feature settings, merged; `revision` changes whenever a pack registers or unregisters */
export interface PackSettingsDefaults {
  revision: number;
  settings: { plugins: Record<string, unknown> & { _meta?: { visibility: Record<string, boolean> } } };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Problems with a feature's settings: a feature sets only its own plugin's slice and visibility,
 * so a pack can't change the app's or another plugin's defaults.
 */
export function checkFeatureSettings(featureId: string, settings: unknown): string[] {
  const where = `Feature "${featureId}" settings`;
  if (!isRecord(settings)) return [`${where} must default-export an object`];
  const problems = Object.keys(settings).filter((key) => key !== 'plugins').map((key) => `${where} set "${key}"; only "plugins.${featureId}" and "plugins._meta.visibility.${featureId}" are allowed`);
  const { plugins } = settings;
  if (plugins === undefined) return problems;
  if (!isRecord(plugins)) return [...problems, `${where}: "plugins" must be an object`];
  for (const [key, value] of Object.entries(plugins)) {
    if (key === featureId) continue;
    if (key !== '_meta') {
      problems.push(`${where} set "plugins.${key}"; a feature sets only its own plugin's settings, "plugins.${featureId}"`);
      continue;
    }
    if (!isRecord(value)) {
      problems.push(`${where}: "plugins._meta" must be an object`);
      continue;
    }
    for (const [metaKey, metaValue] of Object.entries(value)) {
      if (metaKey !== 'visibility') {
        problems.push(`${where} set "plugins._meta.${metaKey}"; only "plugins._meta.visibility.${featureId}" is allowed`);
      } else if (!isRecord(metaValue) || Object.entries(metaValue).some(([id, visible]) => id !== featureId || typeof visible !== 'boolean')) {
        problems.push(`${where}: "plugins._meta.visibility" may only set "${featureId}" to true or false`);
      }
    }
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
