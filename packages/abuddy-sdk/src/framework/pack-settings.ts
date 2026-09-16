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

const registered = new Map<string, Array<{ id: string; settings: FeatureSettings }>>();
const listeners = new Set<() => void>();
let current: PackSettingsDefaults = { revision: 0, settings: { plugins: {} } };

function rebuild(): void {
  const plugins: Record<string, unknown> = {};
  const visibility: Record<string, boolean> = {};
  for (const features of registered.values()) {
    for (const { id, settings } of features) {
      const own = settings.plugins ?? {};
      if (id in own) plugins[id] = own[id];
      const visible = (own._meta as { visibility?: Record<string, boolean> } | undefined)?.visibility?.[id];
      if (visible !== undefined) visibility[id] = visible;
    }
  }
  current = { revision: current.revision + 1, settings: { plugins: { ...plugins, ...(Object.keys(visibility).length > 0 && { _meta: { visibility } }) } } };
  for (const listener of listeners) listener();
}

/** The default settings registered packs' features declare */
export function getPackSettingsDefaults(): PackSettingsDefaults {
  return current;
}

/** Calls `listener` whenever a pack's feature settings are registered or unregistered; returns the unsubscribe */
export function onPackSettingsDefaultsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @internal Host-only: the pack registry registers each pack's feature settings */
export const packSettingsRegistry = {
  register(packId: string, features: ReadonlyArray<{ id: string; settings?: FeatureSettings }>): void {
    const withSettings = features.filter((feature): feature is { id: string; settings: FeatureSettings } => feature.settings !== undefined);
    const problems = withSettings.flatMap(({ id, settings }) => checkFeatureSettings(id, settings));
    if (problems.length > 0) throw new Error(`Pack "${packId}" has invalid feature settings:\n  ${problems.join('\n  ')}`);
    if (withSettings.length === 0 && !registered.has(packId)) return;
    registered.set(packId, withSettings);
    rebuild();
  },

  unregister(packId: string): void {
    if (registered.delete(packId)) rebuild();
  },
};
