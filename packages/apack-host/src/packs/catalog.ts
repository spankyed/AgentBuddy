import { parseSnapshot, type PackSnapshot } from '@apackdev/sdk/build';
import { _compileSettingsDefinition, type SettingsDefinition } from '@apackdev/sdk/framework';
import { splitRef, type FeatureRef } from '@apackdev/sdk/ids';
import { createLogger } from '@apackdev/sdk/logger';

type CatalogData<T> = T extends object ? { readonly [K in keyof T]: CatalogData<T[K]> } : T;

/** An installed artifact's declarations and host-owned enablement, independent of activation. */
export interface PackCatalogEntry {
  readonly snapshot: CatalogData<PackSnapshot>;
  readonly dir: string;
  readonly enabled: boolean;
}

export interface PackCatalogSource {
  snapshot: unknown;
  dir: string;
  enabled: boolean;
}

export interface PackCatalogSnapshot {
  readonly revision: number;
  readonly appSettings: CatalogData<SettingsDefinition>;
  readonly packs: readonly PackCatalogEntry[];
}

/** Own immutable data; neither input mutation nor a reader can change a committed catalog. */
function immutable<T>(data: T): CatalogData<T> {
  const copy = structuredClone(data);
  const seen = new Set<object>();
  function freeze(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  freeze(copy);
  return copy as CatalogData<T>;
}

/** One declaration catalog; settings are a projection, not another store of contributed defaults. */
export function createContributionCatalog(appSettings: SettingsDefinition) {
  const logger = createLogger('pack-catalog');
  const app = immutable(appSettings);
  _compileSettingsDefinition(app);
  let current: PackCatalogSnapshot = immutable({ revision: 0, appSettings: app, packs: [] });
  let byId = new Map<string, PackCatalogEntry>();
  const listeners = new Set<() => void>();
  const emptySettings: CatalogData<Record<string, SettingsDefinition>> = Object.freeze({});

  return {
    getSnapshot: (): PackCatalogSnapshot => current,
    get: (packId: string): PackCatalogEntry | undefined => byId.get(packId),
    packSettings: (packId: string): CatalogData<Record<string, SettingsDefinition>> =>
      byId.get(packId)?.snapshot.manifest.extensions?.settings ?? emptySettings,

    featureSettings: (ref: FeatureRef): CatalogData<SettingsDefinition> | undefined => {
      const address = splitRef(ref);
      return address ? byId.get(address.packId)?.snapshot.manifest.features?.[address.featureId]?.settings : undefined;
    },

    /** Validate the whole candidate before publication; a refusal leaves the previous revision intact. */
    replace(sources: readonly PackCatalogSource[]): void {
      const next = new Map<string, PackCatalogEntry>();
      for (const source of sources) {
        const candidate = immutable(source);
        const result = parseSnapshot(candidate.snapshot);
        if (!result.snapshot) throw new Error(`Pack declarations in ${source.dir}: ${result.diagnostics.map(issue => issue.message).join('; ')}`);
        const id = result.snapshot.manifest.id;
        const other = next.get(id);
        if (other) throw new Error(`Pack "${id}" is declared twice: ${other.dir} and ${source.dir}`);
        next.set(id, { ...candidate, snapshot: result.snapshot });
      }
      const snapshot = immutable({ revision: current.revision + 1, appSettings: app, packs: [...next.values()] });
      byId = new Map(snapshot.packs.map(entry => [entry.snapshot.manifest.id, entry]));
      current = snapshot;
      for (const listener of listeners) {
        try { listener(); }
        catch (error) { logger.error('Contribution catalog listener failed', error instanceof Error ? error : new Error(String(error))); }
      }
    },

    onChanged(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
