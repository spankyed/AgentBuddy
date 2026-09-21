import { splitRef, type FeatureRef } from '../ids/addressing.ts';
import { boundHost } from '../runtime/host-runtime.ts';

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Problems with a feature's settings: a feature sets only its own plugin's slice and whether its tab shows,
 * so a pack can't change the app's or another plugin's defaults.
 */
export function checkFeatureSettings(featureId: string, settings: unknown): string[] {
  const where = `Feature "${featureId}" settings`;
  if (!isRecord(settings)) return [`${where} must default-export an object`];
  const problems = Object.keys(settings).filter((key) => key !== 'plugins' && key !== 'visible')
    .map((key) => `${where} set "${key}"; only "plugins.${featureId}" and "visible" are allowed`);
  if (settings.visible !== undefined && typeof settings.visible !== 'boolean') problems.push(`${where}: "visible" must be true or false`);
  const { plugins } = settings;
  if (plugins === undefined) return problems;
  if (!isRecord(plugins)) return [...problems, `${where}: "plugins" must be an object`];
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

/** `over` laid on `under`: nested objects merge, and anywhere else `over` wins */
function mergeUnder(under: unknown, over: unknown): unknown {
  if (!isRecord(under) || !isRecord(over)) return over;
  const merged: Record<string, unknown> = { ...under };
  for (const [key, value] of Object.entries(over)) merged[key] = key in under ? mergeUnder(under[key], value) : value;
  return merged;
}

/** Each bare feature id `refs` gives one owner for, to that owner's ref; a shared one maps to nobody */
function ownersOf(refs: readonly FeatureRef[]): Map<string, FeatureRef | null> {
  const owners = new Map<string, FeatureRef | null>();
  for (const ref of refs) {
    const parts = splitRef(ref);
    if (!parts) continue;
    owners.set(parts.featureId, owners.has(parts.featureId) ? null : ref);
    // Development builds of 0.3.15 stored plugins under `<packId>.<featureId>` before the spelling settled
    owners.set(`${parts.packId}.${parts.featureId}`, ref);
  }
  return owners;
}

/**
 * The plugin a stored id stands for among `refs`: the id itself when it is one of them, else the ref of the
 * one plugin whose feature id it is (a plugin ran under its bare feature id before 0.3.15). Undefined when it
 * names none of them, or a feature id two of them share, since nothing says whose it was.
 */
export function pluginRefOf(id: string, refs: readonly FeatureRef[]): FeatureRef | undefined {
  if ((refs as readonly string[]).includes(id)) return id as FeatureRef;
  return ownersOf(refs).get(id) ?? undefined;
}

/**
 * A record keyed by plugin (the stored plugin settings, the sidebar visibility) with every key a bare feature id
 * stands for moved onto its plugin's ref, among `refs` (the registered plugins by default); see `pluginRefOf`.
 * When both a bare key and its ref hold a value, they merge, the ref's winning wherever both set one: the
 * older migrations that run before 0.3.15's on an upgrade already write to the ref. When nothing moves,
 * `record` comes back as it was, so a second run changes nothing.
 */
export function addressPluginKeys<T extends Record<string, unknown>>(
  record: T,
  refs: readonly FeatureRef[] = boundHost().packs.pluginIds(),
): { record: T; moved: number } {
  const owners = ownersOf(refs);
  const next: Record<string, unknown> = { ...record };
  let moved = 0;
  for (const key of Object.keys(record)) {
    const ref = owners.get(key);
    if (!ref) continue;
    next[ref] = ref in next ? mergeUnder(record[key], next[ref]) : record[key];
    delete next[key];
    moved++;
  }
  return moved === 0 ? { record, moved } : { record: next as T, moved };
}
