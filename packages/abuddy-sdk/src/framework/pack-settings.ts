import { splitRef, type FeatureRef } from '../ids/addressing.ts';
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

/** `over` laid on `under`: nested objects merge, and anywhere else `over` wins */
function mergeUnder(under: unknown, over: unknown): unknown {
  if (!isRecord(under) || !isRecord(over)) return over;
  const merged: Record<string, unknown> = { ...under };
  for (const [key, value] of Object.entries(over)) merged[key] = key in under ? mergeUnder(under[key], value) : value;
  return merged;
}

/** The app's metadata inside the stored plugin settings, keyed by plugin address */
interface PluginSettingsMeta {
  visibility?: Record<string, unknown>;
  lastActivePlugin?: unknown;
}

/**
 * Stored plugin settings with every key a bare feature id stands for moved onto its plugin's ref: each
 * plugin's slice, its sidebar visibility (`_meta.visibility`) and the last-active plugin
 * (`_meta.lastActivePlugin`). Before 0.3.15 a plugin ran under its feature id, and that's how its settings
 * were stored. A bare id belongs to the plugin among `addresses` (the registered plugins by default) with that
 * feature id; one that two of them share is left where it is, since nothing says whose it was. When both a
 * bare key and its address hold settings, they merge, the address's value winning wherever both set one: the
 * older migrations that run before this one on an upgrade already write to the address. When nothing moves,
 * `plugins` comes back as it was, so a second run changes nothing.
 */
export function addressPluginSettings<T extends Record<string, unknown>>(
  plugins: T,
  addresses: readonly FeatureRef[] = boundHost().packs.pluginIds(),
): { plugins: T; moved: number } {
  const owners = new Map<string, FeatureRef | null>();
  for (const address of addresses) {
    const parts = splitRef(address);
    if (!parts) continue;
    owners.set(parts.featureId, owners.has(parts.featureId) ? null : address);
    // Development builds of 0.3.15 stored plugins under `<packId>.<featureId>` before the spelling settled
    owners.set(`${parts.packId}.${parts.featureId}`, address);
  }
  const ownerOf = (key: string): FeatureRef | undefined => owners.get(key) ?? undefined;

  let moved = 0;
  const addressKeys = (record: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...record };
    for (const key of Object.keys(record)) {
      const address = ownerOf(key);
      if (!address) continue;
      next[address] = address in next ? mergeUnder(record[key], next[address]) : record[key];
      delete next[key];
      moved++;
    }
    return next;
  };

  const next = addressKeys(plugins);
  const meta = plugins._meta;
  if (isRecord(meta)) {
    const { visibility, lastActivePlugin } = meta as PluginSettingsMeta;
    const nextMeta: PluginSettingsMeta = { ...meta };
    if (isRecord(visibility)) nextMeta.visibility = addressKeys(visibility);
    const lastActive = typeof lastActivePlugin === 'string' ? ownerOf(lastActivePlugin) : undefined;
    if (lastActive) {
      nextMeta.lastActivePlugin = lastActive;
      moved++;
    }
    next._meta = nextMeta;
  }
  return moved === 0 ? { plugins, moved } : { plugins: next as T, moved };
}
