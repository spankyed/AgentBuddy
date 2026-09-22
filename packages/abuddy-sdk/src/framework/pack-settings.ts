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

/** Among what `refs` a stored bare id is looked up, and whose plugins win a feature id several of them share */
export interface PluginOwners {
  /** The plugins a stored id may stand for (the registered plugins by default) */
  refs?: readonly FeatureRef[];
  /**
   * The built-in packs (the registered ones by default). Before 0.3.15 every plugin ran under its bare feature
   * id and the built-in packs registered first, so a bare id a built-in plugin shares with another pack's was the
   * built-in plugin's.
   */
  builtIn?: readonly string[];
}

/**
 * Each bare feature id to its owner's ref: the one plugin among `refs` with that feature id, or of several, the one
 * a built-in pack owns. A feature id no single one owns (two external packs share it) maps to nobody.
 */
function ownersOf({ refs = boundHost().packs.pluginIds(), builtIn = boundHost().packs.builtInPackIds() }: PluginOwners): Map<string, FeatureRef | null> {
  const byFeature = new Map<string, FeatureRef[]>();
  const owners = new Map<string, FeatureRef | null>();
  for (const ref of refs) {
    const parts = splitRef(ref);
    if (!parts) continue;
    byFeature.set(parts.featureId, [...(byFeature.get(parts.featureId) ?? []), ref]);
  }
  for (const [featureId, candidates] of byFeature) {
    const builtInOnes = candidates.filter((ref) => builtIn.includes(splitRef(ref)!.packId));
    owners.set(featureId, candidates.length === 1 ? candidates[0] : builtInOnes.length === 1 ? builtInOnes[0] : null);
  }
  return owners;
}

/**
 * The plugin a stored id stands for: the id itself when it is one of the plugins, else the owner of the bare feature
 * id (a plugin ran under its bare feature id before 0.3.15; see `PluginOwners`). Undefined when it names none of
 * them, or a feature id no single one owns.
 */
export function pluginRefOf(id: string, owners: PluginOwners = {}): FeatureRef | undefined {
  const refs = owners.refs ?? boundHost().packs.pluginIds();
  if ((refs as readonly string[]).includes(id)) return id as FeatureRef;
  return ownersOf({ ...owners, refs }).get(id) ?? undefined;
}

/**
 * A record keyed by plugin (the stored plugin settings, the sidebar visibility) with every key a bare feature id
 * stands for moved onto its owner's ref (see `PluginOwners`); with `movesTo`, only keys moving to a plugin it takes
 * (told whether a built-in pack owns it).
 * A key no plugin owns stays as it is, to move when its pack registers.
 * When both a bare key and its ref hold a value, they merge, the ref's winning wherever both set one: the
 * older migrations that run before 0.3.15's on an upgrade already write to the ref. When nothing moves,
 * `record` comes back as it was, so a second run changes nothing.
 */
export function addressPluginKeys<T extends Record<string, unknown>>(
  record: T,
  { movesTo = () => true, ...owners }: PluginOwners & { movesTo?: (ref: FeatureRef, owner: { builtIn: boolean }) => boolean } = {},
): { record: T; moved: number } {
  const ownerOf = ownersOf(owners);
  const builtIn = owners.builtIn ?? boundHost().packs.builtInPackIds();
  const next: Record<string, unknown> = { ...record };
  let moved = 0;
  for (const key of Object.keys(record)) {
    const ref = ownerOf.get(key);
    if (!ref || !movesTo(ref, { builtIn: builtIn.includes(splitRef(ref)!.packId) })) continue;
    next[ref] = ref in next ? mergeUnder(record[key], next[ref]) : record[key];
    delete next[key];
    moved++;
  }
  return moved === 0 ? { record, moved } : { record: next as T, moved };
}
