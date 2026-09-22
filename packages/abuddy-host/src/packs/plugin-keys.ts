// Before 0.3.15 every plugin ran under its bare feature id, and what the app stored about one (its settings in the
// settings row, its tab's visibility and whether it was last open in the shell's state) was keyed that way. This
// moves each such key onto its plugin's ref, once that plugin is registered. It runs in the host's 0.3.15 migration,
// before any pack's migrations read the keys, and on each `PACK_CHANGED`, for a pack disabled while that ran. Only
// the host does it: nothing else knows every registered plugin.
//
// Delete this, and its callers, once no supported upgrade starts below 0.3.15.
import { tx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import { splitRef, type FeatureRef } from '@abuddy/sdk/ids';
import { appState } from '../app-state/index.ts';
import type { PackRegistry } from './pack-registration.ts';

/** Among which plugins a stored bare id is looked up, and whose plugin wins a feature id several share */
export interface PluginOwners {
  refs: readonly FeatureRef[];
  /**
   * The built-in packs. The built-in packs registered first, so a bare id a built-in plugin shares with another
   * pack's was the built-in plugin's.
   */
  builtIn: readonly string[];
}

/** The registered plugins, a built-in pack's winning a feature id several share */
export const pluginOwners = (registry: Pick<PackRegistry, 'pluginIds' | 'builtInPacks'>): PluginOwners => ({
  refs: registry.pluginIds(),
  builtIn: registry.builtInPacks().map(({ id }) => id),
});

/** Each bare feature id to its owner's ref, or null when no single one owns it (two external packs share it) */
function ownersOf({ refs, builtIn }: PluginOwners): Map<string, FeatureRef | null> {
  const byFeature = new Map<string, FeatureRef[]>();
  for (const ref of refs) {
    const parts = splitRef(ref);
    if (parts) byFeature.set(parts.featureId, [...(byFeature.get(parts.featureId) ?? []), ref]);
  }
  const owners = new Map<string, FeatureRef | null>();
  for (const [featureId, candidates] of byFeature) {
    const builtInOnes = candidates.filter((ref) => builtIn.includes(splitRef(ref)!.packId));
    owners.set(featureId, candidates.length === 1 ? candidates[0] : builtInOnes.length === 1 ? builtInOnes[0] : null);
  }
  return owners;
}

/** The plugin a stored id stands for: itself when it is one, else the owner of the bare feature id */
export function pluginRefOf(id: string, owners: PluginOwners): FeatureRef | undefined {
  if ((owners.refs as readonly string[]).includes(id)) return id as FeatureRef;
  return ownersOf(owners).get(id) ?? undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `over` laid on `under`: nested objects merge, and anywhere else `over` wins */
function mergeUnder(under: unknown, over: unknown): unknown {
  if (!isRecord(under) || !isRecord(over)) return over;
  const merged: Record<string, unknown> = { ...under };
  for (const [key, value] of Object.entries(over)) merged[key] = key in under ? mergeUnder(under[key], value) : value;
  return merged;
}

/**
 * A record keyed by plugin with every key a bare feature id stands for moved onto its owner's ref. A key no plugin
 * owns stays, to move when its pack registers. A bare key and its ref both holding a value merge, the ref's winning
 * wherever both set one. When nothing moves, `record` comes back as it was, so a second run changes nothing.
 */
export function addressPluginKeys<T extends Record<string, unknown>>(record: T, owners: PluginOwners): { record: T; moved: number } {
  const ownerOf = ownersOf(owners);
  const next: Record<string, unknown> = { ...record };
  let moved = 0;
  for (const key of Object.keys(record)) {
    const ref = ownerOf.get(key);
    if (!ref) continue;
    next[ref] = ref in next ? mergeUnder(record[key], next[ref]) : record[key];
    delete next[key];
    moved++;
  }
  return moved === 0 ? { record, moved } : { record: next as T, moved };
}

/** The settings row: default-setup's entity, which held every plugin's settings under its bare id */
const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

/** The shell's state (tab visibility, the plugin last open) with its bare ids moved onto the plugins now owning them */
export function addressShellState(owners: PluginOwners): void {
  const { pluginVisibility, lastActivePlugin } = appState.get();
  const visibility = addressPluginKeys(pluginVisibility, owners);
  const lastActive = lastActivePlugin && !splitRef(lastActivePlugin) ? pluginRefOf(lastActivePlugin, owners) : undefined;
  if (visibility.moved === 0 && !lastActive) return;
  appState.update({
    ...(visibility.moved > 0 && { pluginVisibility: visibility.record }),
    ...(lastActive && { lastActivePlugin: lastActive }),
  });
}

/** Moves every bare key the app stored, in the shell's state and the settings row, onto the registered plugin owning it */
export function addressStoredPluginKeys(registry: Pick<PackRegistry, 'pluginIds' | 'builtInPacks'>): void {
  const owners = pluginOwners(registry);
  addressShellState(owners);
  const data = (untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: { plugins?: Record<string, unknown> } } | undefined)?.data;
  if (!data?.plugins) return;
  const { record: plugins, moved } = addressPluginKeys(data.plugins, owners);
  if (moved > 0) tx(SETTINGS_ID).put('data', { ...data, plugins });
}
