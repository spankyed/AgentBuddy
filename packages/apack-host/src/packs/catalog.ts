import type { AppPackSource, AppPackSourceProblem, AppPackSources } from './app-sources.ts';
import { readInstalledPackArtifacts } from './discovery.ts';
import { packArtifactRevision, shippedPackRevision, type PackIntegrity } from './layout.ts';
import { appSettingsDefinition } from '../features/settings/be/app-definition.ts';
import { hasOwn } from '@apackdev/sdk/utils/pure';
import { isDeepStrictEqual } from 'node:util';
import { parseSnapshot, ManifestSchema, _NativePackDeclarationSchema, _declarationRevision, _helpDataProblem, type PackSnapshot, type PackManifest } from '@apackdev/sdk/build';
import { _compileSettingsDefinition, type SettingsDefinition, type SettingsCatalog, type HelpDocument, type HelpCatalog, type NativePackDeclaration, type PluginDeclaration } from '@apackdev/sdk/framework';
import { resolveName, PACK_ID_PATTERN, FEATURE_ID_PATTERN, type FeatureRef } from '@apackdev/sdk/ids';
import { createLogger } from '@apackdev/sdk/logger';

type CatalogData<T> = T extends object ? { readonly [K in keyof T]: CatalogData<T[K]> } : T;

/** An installed artifact's declarations and host-owned enablement, independent of activation. */
export interface PackCatalogEntry {
  readonly snapshot: CatalogData<PackSnapshot>;
  readonly dir: string;
  readonly enabled: boolean;
  /** Verified installed asset receipt; source/dependency data projections do not manufacture one. */
  readonly integrity?: CatalogData<PackIntegrity>;
  readonly artifactRevision?: string;
}

export interface PackCatalogSource {
  snapshot: unknown;
  dir: string;
  enabled: boolean;
  integrity?: PackIntegrity;
}

/** Source authoring declares its manifest before a bundle exists; this is not installed admission. */
export interface SourcePackDeclaration {
  readonly manifest: CatalogData<PackManifest>;
  readonly dir: string;
  readonly declarationRevision: string;
  readonly help?: CatalogData<HelpDocument[]>;
}

/** Known plugin data; availability and accepted executable bindings are separate. */
export interface PluginCatalogEntry {
  readonly featureRef: FeatureRef;
  readonly packId: string;
  readonly origin: 'native' | 'installed' | 'source';
  readonly declaration: CatalogData<PluginDeclaration>;
  readonly declarationRevision?: string;
  readonly enabled?: boolean;
}

/** A visible installed directory whose candidate declarations could not be accepted. */
export interface PackCatalogProblem {
  readonly id: string;
  readonly dir: string;
  readonly enabled: boolean;
  readonly message: string;
}

export interface PackCatalogSnapshot {
  readonly revision: number;
  readonly appSettings: CatalogData<SettingsDefinition>;
  readonly packs: readonly PackCatalogEntry[];
  readonly problems: readonly PackCatalogProblem[];
  readonly native: readonly CatalogData<NativePackDeclaration>[];
  readonly sourcePacks: readonly SourcePackDeclaration[];
  readonly appPackSources: readonly CatalogData<AppPackSource>[];
  readonly appPackSourceProblems: readonly CatalogData<AppPackSourceProblem>[];
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
  let current: PackCatalogSnapshot = immutable({ revision: 0, appSettings: app, packs: [], problems: [], native: [], sourcePacks: [], appPackSources: [], appPackSourceProblems: [] });
  let byId = new Map<string, PackCatalogEntry>();
  const listeners = new Set<() => void>();
  const emptySettings: CatalogData<Record<string, SettingsDefinition>> = Object.freeze({});
  let settings: SettingsCatalog = immutable({ revision: 0, app, packs: {}, features: {}, dependencies: {} });
  let help: CatalogData<HelpCatalog> = immutable({ articles: [], problems: [] });

  function publish(changes: Partial<Omit<PackCatalogSnapshot, 'revision' | 'appSettings'>>): void {
    const { packs, native, sourcePacks, problems: catalogProblems, appPackSources, appPackSourceProblems } = { ...current, ...changes };
    const declarationsChanged = !isDeepStrictEqual(current.packs, packs)
      || !isDeepStrictEqual(current.native, native) || !isDeepStrictEqual(current.sourcePacks, sourcePacks);
    if (!declarationsChanged && isDeepStrictEqual(current.problems, catalogProblems)
      && isDeepStrictEqual(current.appPackSources, appPackSources)
      && isDeepStrictEqual(current.appPackSourceProblems, appPackSourceProblems)) return;
    const manifests = [...packs.map(({ snapshot }) => snapshot.manifest), ...sourcePacks.map(source => source.manifest)];
    const definitions = [...native, ...manifests.map(manifest => ({
      id: manifest.id, dependencies: manifest.dependencies,
      settings: manifest.extensions?.settings, features: manifest.features,
    }))];
    const ids = new Set<string>();
    const groups: Record<string, Record<string, SettingsDefinition>> = {};
    const features: Record<string, SettingsDefinition> = {};
    const dependencies: Record<string, string[]> = {};
    for (const pack of definitions) {
      if (!PACK_ID_PATTERN.test(pack.id) || ids.has(pack.id)) throw new Error(`Duplicate or invalid declaration owner "${pack.id}"`);
      ids.add(pack.id);
      groups[pack.id] = {};
      dependencies[pack.id] = Object.keys(pack.dependencies ?? {});
      for (const [id, definition] of Object.entries(pack.settings ?? {})) {
        if (!FEATURE_ID_PATTERN.test(id)) throw new Error(`Invalid settings group "${pack.id}/${id}"`);
        _compileSettingsDefinition(definition);
        groups[pack.id][id] = definition;
      }
      for (const [id, feature] of Object.entries(pack.features ?? {})) {
        if (!FEATURE_ID_PATTERN.test(id)) throw new Error(`Invalid feature "${pack.id}/${id}"`);
        if (feature.settings) {
          _compileSettingsDefinition(feature.settings);
          features[resolveName(id, pack.id)] = feature.settings;
        }
      }
    }
    const next = immutable({ revision: current.revision + 1, appSettings: app, packs, problems: catalogProblems, native, sourcePacks, appPackSources, appPackSourceProblems });
    // Diagnostics and source offers leave accepted settings definitions and their identity intact.
    const projection = declarationsChanged ? immutable({ revision: next.revision, app, packs: groups, features, dependencies }) : settings;
    const helpOwners = [
      ...packs.map(({ snapshot }) => ({ manifest: snapshot.manifest, help: snapshot.help })),
      ...sourcePacks.map(source => ({ manifest: source.manifest, help: source.help })),
    ];
    const articles: HelpCatalog['articles'] = [];
    const problems: HelpCatalog['problems'] = [];
    for (const owner of helpOwners) {
      if (owner.help === undefined) {
        if (owner.manifest.extensions?.help) problems.push({ packId: owner.manifest.id, message: 'Help data is unavailable; build the complete pack.' });
        continue;
      }
      const problem = _helpDataProblem(owner.help, Object.keys(owner.manifest.features ?? {}));
      if (problem || !owner.manifest.extensions?.help) throw new Error(`Pack "${owner.manifest.id}" help: ${problem ?? 'undeclared help data'}`);
      articles.push(...(structuredClone(owner.help) as HelpDocument[]).map(article => ({ ...article, packId: owner.manifest.id, packName: owner.manifest.name })));
    }
    articles.sort((a, b) => a.packName.localeCompare(b.packName) || a.packId.localeCompare(b.packId)
      || (a.order ?? Infinity) - (b.order ?? Infinity) || a.title.localeCompare(b.title));
    const helpProjection = immutable({ articles, problems });
    byId = new Map(next.packs.map(entry => [entry.snapshot.manifest.id, entry]));
    current = next;
    settings = projection;
    help = helpProjection;
    for (const listener of listeners) {
      try { listener(); }
      catch (error) { logger.error('Contribution catalog listener failed', error instanceof Error ? error : new Error(String(error))); }
    }
  }

  return {
    getSnapshot: (): PackCatalogSnapshot => current,
    plugins(): readonly PluginCatalogEntry[] {
      const collect = (packId: string, features: Record<string, { plugin?: CatalogData<PluginDeclaration> }> | undefined,
        origin: PluginCatalogEntry['origin'], identity: Pick<PluginCatalogEntry, 'enabled' | 'declarationRevision'> = {}) =>
        Object.entries(features ?? {}).flatMap(([id, feature]) => feature.plugin
          ? [Object.freeze({ featureRef: resolveName(id, packId), packId, origin, declaration: feature.plugin, ...identity })] : []);
      return Object.freeze([
        ...current.native.flatMap(pack => collect(pack.id, pack.features, 'native', { enabled: true })),
        ...current.packs.flatMap(pack => collect(pack.snapshot.manifest.id, pack.snapshot.manifest.features, 'installed',
          { enabled: pack.enabled, declarationRevision: pack.snapshot.declarationRevision })),
        ...current.sourcePacks.flatMap(pack => collect(pack.manifest.id, pack.manifest.features, 'source',
          { declarationRevision: pack.declarationRevision })),
      ]);
    },
    get: (packId: string): PackCatalogEntry | undefined => byId.get(packId),
    settings: (): SettingsCatalog => settings,
    help: (): HelpCatalog => structuredClone(help) as HelpCatalog,
    /** Source declarations persist across registration changes, like installed declarations. */
    setSources(sources: readonly SourcePackDeclaration[]): void {
      const next = sources.map(source => {
        const result = ManifestSchema.safeParse(source.manifest);
        if (!result.success) throw new Error(`Source pack declarations in ${source.dir}: ${result.error.issues.map(issue => issue.message).join('; ')}`);
        if (_declarationRevision(result.data) !== source.declarationRevision) throw new Error(`Source pack "${result.data.id}" has a stale declaration identity`);
        return { ...source, manifest: result.data };
      });
      publish({ sourcePacks: next });
    },
    /** Available app defaults are not active owners and never change settings/help definitions. */
    setAppPackSources(input: AppPackSources): void {
      const ids = new Set<string>();
      const sources = input.sources.map(source => {
        const result = parseSnapshot(source.snapshot);
        if (!result.snapshot || result.snapshot.manifest.id !== source.id || ids.has(source.id)
          || source.sourceRevision !== shippedPackRevision(source.files)) {
          throw new Error(`Invalid or conflicting app source declarations: ${source.dir}`);
        }
        ids.add(source.id);
        return { ...source, snapshot: result.snapshot };
      });
      publish({ appPackSources: sources, appPackSourceProblems: input.problems });
    },
    setNative(declarations: readonly NativePackDeclaration[]): void {
      for (const declaration of declarations) {
        const result = _NativePackDeclarationSchema.safeParse(declaration);
        if (!result.success) throw new Error(`Invalid native declarations: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
      }
      publish({ native: declarations });
    },
    packSettings: (packId: string): CatalogData<Record<string, SettingsDefinition>> =>
      hasOwn(settings.packs, packId) ? settings.packs[packId] : emptySettings,

    featureSettings: (ref: FeatureRef): CatalogData<SettingsDefinition> | undefined =>
      hasOwn(settings.features, ref) ? settings.features[ref] : undefined,

    /** Validate the whole candidate before publication; a refusal leaves the previous revision intact. */
    replace(sources: readonly PackCatalogSource[], problems: readonly PackCatalogProblem[] = []): void {
      const next = new Map<string, PackCatalogEntry>();
      for (const source of sources) {
        const candidate = immutable(source);
        const result = parseSnapshot(candidate.snapshot);
        if (!result.snapshot) throw new Error(`Pack declarations in ${source.dir}: ${result.diagnostics.map(issue => issue.message).join('; ')}`);
        const id = result.snapshot.manifest.id;
        const other = next.get(id);
        if (other) throw new Error(`Pack "${id}" is declared twice: ${other.dir} and ${source.dir}`);
        if (candidate.integrity && (candidate.integrity.id !== id || candidate.integrity.version !== result.snapshot.manifest.version)) {
          throw new Error(`Pack "${id}" asset receipt does not match its declarations`);
        }
        next.set(id, { ...candidate, snapshot: result.snapshot,
          ...(candidate.integrity && { artifactRevision: packArtifactRevision(candidate.integrity) }) });
      }
      publish({ packs: [...next.values()], problems });
    },

    onChanged(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ContributionCatalog = ReturnType<typeof createContributionCatalog>;

/** Offline tools refuse incomplete installed definitions instead of treating invalid packs as absent. */
export function readInstalledContributionCatalog(packsDir: string, disabled: ReadonlySet<string>): ContributionCatalog {
  const catalog = createContributionCatalog(appSettingsDefinition);
  catalog.replace(readInstalledPackArtifacts(packsDir).map(entry => {
    if (!entry.artifact) throw new Error(`Pack "${entry.id}" declarations in ${entry.dir}: ${entry.problem}`);
    const { snapshot, integrity } = entry.artifact;
    return { snapshot, integrity, dir: entry.dir, enabled: !disabled.has(entry.id) };
  }));
  return catalog;
}
