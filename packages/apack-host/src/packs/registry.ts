import { captureData } from './captured-data.ts';
import type { StepBackendBinding } from '@apackdev/sdk/steps';
import type { DeclarationData } from '@apackdev/sdk/framework';
import type { StepEntry } from '@apackdev/sdk/build';
import { captureStepBinding, captureStepDeclaration } from './step-bindings.ts';
import { lifecycleBindingProblem } from './lifecycle-binding.ts';
import { _packEntityTypes, _packRelationTypes } from '@apackdev/sdk/framework';
import { backendBindingProblem, backendStepBindingProblem, commandBindingProblem, contentBindingProblem } from './declaration-binding.ts';
/**
 * Pack Registration
 *
 * The registered packs, as an instance: the app's composition root, the test harness and the CLI each create one.
 * It holds what packs contributed and the only writes to it (register, unregister), and implements the read-only
 * view the SDK's lookups read once it's bound (`HostRuntime.packs`).
 */

import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { AnyStateMachine } from 'xstate';
import type { PackRegistration, PackLifecycleHooks, PackEARS, PackMigration, PackFeature, PackFeatureSystem } from '@apackdev/sdk/framework';
import { _packDeclarationProblem, type ContentRuntime } from '@apackdev/sdk/framework';
import type { MigrationLine, PackManifest } from '@apackdev/sdk/build';
import type { PackRegistryView } from '@apackdev/sdk/runtime';
import type { HostServices, SettingsService } from '@apackdev/sdk/services';
import type { ContentOffer, ContentApplier } from '@apackdev/sdk/utils';
import type { ArtifactDefinition } from '@apackdev/sdk/artifacts';
import type { BlockDefinition } from '@apackdev/sdk/blocks';
import { SDK_ENTITIES, SDK_REL_KINDS, _reservedEntries } from '@apackdev/sdk/types';
import { HOST_SYSTEM_EVENT_TYPES, PLUGIN_EVENT_TYPES } from '@apackdev/sdk/events';
import { HOST_PACK_ID, resolveName, type FeatureRef } from '@apackdev/sdk/ids';
import { installedEngine } from '@apackdev/ears';
import { HOST_ENTITY_TYPES } from '../app-state/index.ts';
import { readInstalledPackBuilds, packContentOrder } from './discovery.ts';
import type { PackContentTarget } from './runtime/apply.ts';
import { createOwnedStore, createOwnedStepStore, createDesignationStore } from './extensions.ts';
import { createContentWriterStore, createApplierStore, createShutdownHooks } from './backend-extensions.ts';
import { checkFeatureIds } from './feature-ids.ts';
import { readAppPackSources } from './app-sources.ts';
import { createContributionCatalog, type ContributionCatalog, type PackCatalogProblem, type PackCatalogSource } from './catalog.ts';
import { disabledPackIds } from './installed.ts';
import { appSettingsDefinition } from '../features/settings/be/app-definition.ts';
import { createPackSettingsBinding } from '../services/settings.ts';

export type { PackRegistration, PackLifecycleHooks, PackEARS, PackMigration };

/** Services the host supplies itself; a pack service with one of these names would replace it */
const HOST_SERVICE_NAMES = ['logger', 'emitter', 'repository', 'appData', 'traceStore', 'inference', 'secrets', 'filesystem', 'settings'] as const satisfies readonly (keyof HostServices)[];
// Fails to compile when HostServices gains a service this list doesn't name
const _allHostServicesNamed: Exclude<keyof HostServices, (typeof HOST_SERVICE_NAMES)[number]> extends never ? true : never = true;
void _allHostServicesNamed;

/** Entity types no pack may declare: the SDK's and the host's */
const RESERVED_ENTITIES: readonly string[] = [...Object.values(SDK_ENTITIES), ...HOST_ENTITY_TYPES] as const;
/** The app's own EARS names, as a manifest writes them, which no pack may use as a key or a value */
const appEARS = (): PackEARS => ({
  entities: { ...SDK_ENTITIES, ...Object.fromEntries(HOST_ENTITY_TYPES.map((type) => [type, type])) },
  relKinds: SDK_REL_KINDS,
});

/** A registration's features, each with the ref it runs at, `<packId>/<featureId>` */
function featuresOf({ id, features = {} }: PackRegistration): Array<{ featureId: string; ref: FeatureRef; feature: PackFeature }> {
  return Object.entries(features).map(([featureId, feature]) => ({ featureId, ref: resolveName(featureId, id), feature }));
}

/** A registration's systems at their refs; `early` ones too, which the app starts itself, outside the bus */
function systemsOf(reg: PackRegistration): Array<{ ref: FeatureRef; system: PackFeatureSystem }> {
  return featuresOf(reg).flatMap(({ ref, feature }) => (feature.system ? [{ ref, system: feature.system }] : []));
}

/** The refs of the systems the bus runs for a registration, before or after it registers */
export function packSystemIds(reg: PackRegistration): FeatureRef[] {
  return systemsOf(reg).map(({ ref }) => ref);
}

/** Role → the ref of the feature playing it: its system and its plugin share it */
function designationsOf(reg: PackRegistration): Record<string, FeatureRef> {
  return Object.fromEntries(featuresOf(reg).flatMap(({ ref, feature }) => (feature.designation ? [[feature.designation, ref]] : [])));
}

/** What the app lists of a pack's feature (the Packs plugin shows it) */
export interface PackFeatureSummary {
  id: string;
  description: string;
  designation?: string;
  hasSystem: boolean;
  plugin?: import('@apackdev/sdk/framework').PluginDeclaration;
  references?: import('@apackdev/sdk/framework').ReferenceDeclarations;
  services: readonly string[];
}

export interface PackExtensions {
  systems: string[];
  services: string[];
  steps: string[];
  artifacts: string[];
  blocks: string[];
  relKinds: Record<string, string>;
  migrationCount: number;
  lifecycleHooks: string[];
  features: PackFeatureSummary[];
}

/** An available app default; neither an installed build nor an active owner. */
export interface AppPackSourceSummary {
  id: string;
  name: string;
  version: string;
  sourceRevision: string;
}

export interface InstalledPackSummary extends PackExtensions {
  id: string;
  name: string;
  /** Absent when this installed build has no accepted declarations. */
  version?: string;
  enabled: boolean;
  /** Installation ownership determines automatic updates; advertisement never grants privileges. */
  updatesWith: 'app' | 'user';
  entityCount: number;
  /** Whether the pack has frontend code: its `runtime/fe.js` */
  hasFrontend: boolean;
  hostVersion?: string;
  description?: string;
  entities: Record<string, string>;
  relKinds: Record<string, string>;
  permissions: string[];
  dir?: string;
  installedAt?: string;
  installedFrom?: string;
  availableVersion?: string;
  /** A selected app-managed source update; independent of remote release checks. */
  appUpdate?: AppPackSourceSummary;
  appSourceProblem?: string;
  /** Why the last update check couldn't finish or confirm compatibility */
  updateCheckError?: string;
  /** Why this installed pack isn't running although it is enabled: the app skipped it or failed to load it */
  loadProblem?: string;
  /**
   * The decisions the last apply left the user about this pack's content, in the order the view draws them.
   *
   * It is derived from the pack's `AppliedContent` on every list rather than kept anywhere else, so the
   * answer is whatever the record holds now: a pack applied between two lists simply lists differently.
   */
  contentOffers: PackContentOffer[];
  /**
   * The items the user kept their own version of, which is where "reset to factory" is offered.
   *
   * It is the items carrying a `dismissed` hash, so it is **the ones we know about** rather than every item
   * the user has ever edited: an edit under a `theirs` entry is recorded nowhere, by design, and an unresolved offer
   * is in `contentOffers` instead. Restoring one is the same call as taking an offered version — one item,
   * written over — differing only in what prompted it.
   */
  contentKept: Array<{ key: string; label: string }>;
}

/**
 * One decision about one content item, as the Packs view draws it: what the item is, which parts moved, and
 * which kind of decision it is (`ContentOffer`).
 *
 * `label` is the item rendered from its own key (`describeContentKey`), because the key already holds the
 * entity type and the identity that names it — nothing has to be stored beside it to say what an item is.
 */
export interface PackContentOffer extends ContentOffer {
  /** The content key, which is what resolving it names */
  key: string;
  label: string;
}

/** What a plugin's sends are checked against: the event types it receives */
export type PluginEventTypes = Set<string>;

/**
 * Where the app found a pack, and what the pack says it is. The registration says what a pack contributes;
 * this says where it came from, which only the app knows — `apack.json` is not something a pack's own
 * generated registration can see, and a built-in pack has no install directory of its own to report.
 *
 * It is a second argument to `registerPack` rather than a field on `PackRegistration` because that type is
 * the pack contract: `generate-entries` writes it into every pack and `etc/framework.api.md` pins it.
 */
export interface PackOrigin {
  id: string;
  /** The declarations validated for this active runtime, retained across filesystem changes. */
  declarationRevision: string;
  /** Verified installed file identity; absent only for native registrations supplied by the host. */
  buildRevision?: string;
  /** File membership/checksums admitted with this runtime, never reconstructed from changed disk bytes. */
  buildFiles?: Readonly<Record<string, string>>;
  name: string;
  version: string;
  /** Where the pack's files are: `packs/<id>`, for every pack */
  dir: string;
  /** The pack's `apack.json`, which its loader read to find the pack at all */
  manifest?: PackManifest;
}

/** The registered packs, the host's own (`hostRegistration`) among them, and their shutdown hooks */
/** Runtime coordinators retain incumbent bindings until their actors finish stopping. */
export interface PackReplacementOptions {
  retireBinding(dispose: () => string[]): void;
}

export interface PackRegistry extends PackRegistryView {
  readonly catalog: ContributionCatalog;
  refreshCatalog(packsDir?: string, disabled?: ReadonlySet<string>): void;
  /** Registers a pack; throws on a collision, registering none of it */
  registerPack(pack: PackRegistration, origin?: PackOrigin): void;
  /** Replace an accepted runtime atomically; returns retirement errors after a successful commit. */
  replacePack(pack: PackRegistration, origin?: PackOrigin, options?: PackReplacementOptions): string[];
  /** Bind data operations without activating backend systems or services. */
  registerContentRuntime(runtime: ContentRuntime, origin: PackOrigin, appliers?: ContentApplier[]): void;
  unregisterPack(packId: string): void;
  /**
   * Notes why an installed pack isn't running: the loader skipped it, or its registration was refused. The Packs
   * view shows it in place of the pack's enabled state. Cleared when the pack registers or is torn down.
   */
  recordLoadProblem(packId: string, problem: string): void;
  /** Why an installed pack failed to load, while it hasn't since registered or been torn down */
  loadProblem(packId: string): string | undefined;
  clearLoadProblem(packId: string): void;
  /** Host systems and every registered pack's that the bus runs, by id: all but the early ones */
  getRegisteredSystems(): Map<string, AnyStateMachine>;
  /** The refs of a registered pack's systems, `<packId>/<featureId>` */
  getRegisteredPackSystemIds(packId: string): string[];
  /**
   * Each registered system's id → the incoming event types it accepts (`*` accepts any). Cached until a
   * pack or host system registers or a pack unregisters.
   */
  getEventValidationMap(): Map<string, Set<string>>;
  /**
   * Each plugin's id → the event types it receives, the outgoing counterpart of `getEventValidationMap`.
   * A pack declares its own plugins' (`plugin.receives`, generated from its systems' outgoing unions) and the
   * host declares its own. A plugin absent from the map is one no registered pack owns. Cached on the same
   * terms as the incoming map.
   */
  getPluginEventValidationMap(): Map<string, PluginEventTypes>;
  /** The SDK's entity types, the host's and the registered packs' */
  getRegisteredEntityTypes(): ReadonlySet<string>;
  /**
   * The app's partition policy, from the registered packs' EARS policies: an entity type any of them
   * excludes lives in the volatile partition. It's one object for the registry's lifetime, which the LMDB store
   * is opened with, and each call reads the policy of the packs registered then (cached until a pack
   * registers or unregisters).
   */
  getLifecycleHooks(): PackLifecycleHooks[];
  /** A registered pack's registration, as it was registered */
  getPackRegistration(packId: string): PackRegistration | null;
  /** Where a registered pack came from, or `null` for one registered without an origin (a test's) */
  packOrigin(packId: string): PackOrigin | null;
  /** Accepted installed runtime identity; replacement changes it even when build bytes do not. */
  getPackRuntime(packId: string): { origin: PackOrigin; runtimeRevision: string } | null;
  /** The packs this app loaded, in registration order */
  loadedPacks(): PackOrigin[];
  /**
   * Every registered pack's migrations on one version line, as the runners take them: the pack's manifest
   * and the migrations it declared under that line. With `packIds`, only those — activation and reload
   * migrate the one pack they handled.
   *
   * **The line is the caller's to name, and a pack the app ships is in either answer like any other.**
   * Which line a migration is on is what its pack declared (`apack.json`'s `migrations.app` /
   * `migrations.pack`), so this asks nothing about where a pack came from: `app` for the migrations run
   * against `AppState.version`, `pack` for those run against the pack's own. Filtering on `shipped` here is
   * the trap — it routes by provenance, which makes one `0.4.0` mean the app's release in a pack the app
   * ships and the pack's own version in every other, so a user's build installed at a shipped pack's id has
   * its migrations compared against the wrong thing.
   *
   * **A pack declaring both gets both**, run at the two moments the runners run, which is the one thing a
   * caller splitting a change across lines should know (`src/migrations/CLAUDE.md`).
   *
   * In dependency order (`packContentOrder`), so a pack's migrations run after those of the packs it depends
   * on. Registration order, which decides who wins a designation or a plugin id, is a different order and
   * is not this. That order is read from the packs' manifests, so **a registered pack whose origin carries
   * no manifest is in neither answer** — the loader gives every origin one, and a fixture without one is a
   * pack whose migrations nothing runs.
   *
   * **The order survives for the `pack` line only**, where each pack is migrated against its own recorded
   * version, so the packs stay distinguishable. `runAppMigrations` flattens the `app` line into one list
   * and sorts it by target, because the app's line is one version for every pack — so on that line the
   * order here buys nothing, and a pack cannot rely on being migrated after one it depends on.
   */
  packMigrationTargets(line: MigrationLine, packIds?: Iterable<string>): Array<{ manifest: PackManifest; migrations?: PackMigration[] }>;
  /**
   * Every registered pack as `applyPacks` takes it, in dependency order: where its content are and what it
   * depends on. With `packIds`, only those — activation and reload apply the one pack they handled.
   *
   * A pack the app ships is in here beside an installed one: one apply path, one freshness record, one
   * policy mechanism.
   */
  packContentTargets(packIds?: Iterable<string>): PackContentTarget[];
  /** Registers a hook run when the pack `key` stops, or, without a key, when the app exits */
  registerShutdownHook(hook: () => void, key?: string): void;
  /** Runs every registered shutdown hook (the app exiting) */
  runShutdownHooks(): void;
  /** Runs and removes a pack's shutdown hooks (the pack stopping) */
  runShutdownHooksForKey(key: string): void;
  /** Removes a pack's shutdown hooks without running them */
  removeShutdownHooksForKey(key: string): void;
}

/** Capture ownership and collection membership once; executable values retain their identity. */
function admitContributions(registration: PackRegistration, declarations: DeclarationData<Record<string, StepEntry>> | undefined, origin?: PackOrigin) {
  const runtimeRevision = randomUUID();
  const steps = (registration.steps ?? []).map(binding => {
    if (!declarations || !Object.hasOwn(declarations, binding.type)) throw new Error(`Pack "${registration.id}" needs accepted declarations for step "${binding.type}"`);
    return [binding.type, Object.freeze({ packId: registration.id, runtimeRevision,
      declaration: captureStepDeclaration(declarations[binding.type]), binding,
      ...(origin && { declarationRevision: origin.declarationRevision, buildRevision: origin.buildRevision }),
    })] as const;
  });
  return {
    id: registration.id,
    runtimeRevision,
    steps,
    designations: designationsOf(registration),
    repositories: new Map(Object.entries(registration.repositories ?? {})),
    services: new Map(Object.entries(registration.services ?? {})),
    artifacts: (registration.artifacts ?? []).map(value => [value.type, value] as const),
    blocks: (registration.blocks ?? []).map(value => [value.type, value] as const),
    contentWriters: Object.entries(registration.contentWriters ?? {}),
    appliers: [...(registration.appliers ?? [])],
    commands: (registration.commands ?? []).map(value => ({ ...value })),
  };
}
type AdmittedPackContributions = ReturnType<typeof admitContributions>;

/** Candidate indexes contain no executable binding or engine writes. */
function buildContributionTables(packs: Iterable<AdmittedPackContributions>) {
  const commandOwners = new Map<string, string>();
  const tables = {
    designations: createDesignationStore(),
    steps: createOwnedStepStore<StepBackendBinding>(),
    artifacts: createOwnedStore<ArtifactDefinition>(),
    blocks: createOwnedStore<BlockDefinition>(),
    contentWriters: createContentWriterStore(),
    appliers: createApplierStore(),
    repositories: new Map<string, unknown>(),
  };
  for (const pack of packs) {
    tables.designations.register(pack.designations);
    for (const [type, value] of pack.steps) tables.steps.set(type, value, pack.id);
    for (const [type, value] of pack.artifacts) tables.artifacts.set(type, value, pack.id);
    for (const [type, value] of pack.blocks) tables.blocks.set(type, value, pack.id);
    for (const [name, value] of pack.contentWriters) tables.contentWriters.register(name, value, pack.id);
    tables.appliers.register(pack.id, pack.appliers);
    for (const { name } of pack.commands) {
      const owner = commandOwners.get(name);
      if (owner !== undefined && owner !== pack.id) throw new Error(`Command collision: "${name}" — pack "${pack.id}" vs "${owner}"`);
      commandOwners.set(name, pack.id);
    }
    for (const [name, value] of pack.repositories) tables.repositories.set(name, value);
  }
  return tables;
}

/** Repository publication never runs an incumbent's disposal callback. */
function publishRepositories(before: ReadonlyMap<string, unknown>, next: ReadonlyMap<string, unknown>): void {
  const names = [...new Set([...before.keys(), ...next.keys()])]
    .filter(name => before.has(name) !== next.has(name) || before.get(name) !== next.get(name));
  if (!names.length) return;
  const engine = installedEngine();
  const write = (values: ReadonlyMap<string, unknown>, name: string) => values.has(name)
    ? engine.registerRepository(name, values.get(name)) : engine.unregisterRepository(name);
  const attempted: string[] = [];
  try {
    for (const name of names) { attempted.push(name); write(next, name); }
  } catch (error) {
    const failures: unknown[] = [];
    for (const name of attempted.reverse()) {
      try { write(before, name); }
      catch (failure) { failures.push(failure); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], 'Repository publication and rollback failed');
    throw error;
  }
}

/** A new, empty registry */
export interface PackRegistryOptions {
  /** Native data is admitted before executable registration and survives runtime unload. */
  nativeDeclarations?: readonly import('@apackdev/sdk/framework').NativePackDeclaration[];
  /**
   * The app's packs dir: the installed packs, running or not. A pack there that isn't registered (disabled, or one that
   * didn't load) keeps its settings, so its features count among the features with settings. None when omitted (a
   * build, a test).
   */
  installedPacksDir?: () => string;
  /** Available app defaults remain separate from installed/active contributions. */
  appPackSourcesDir?: () => string | undefined;
  /** Composition supplies scoped authority; registrations cannot choose a caller identity. */
  settingsForPack?: (packId: string) => SettingsService;
}

export function createPackRegistry({ installedPacksDir, appPackSourcesDir, settingsForPack, nativeDeclarations = [] }: PackRegistryOptions = {}): PackRegistry {
  let registrations = new Map<string, PackRegistration>();
  /** Where each registered pack came from. Same keys as `registrations`, so it comes and goes with them */
  let origins = new Map<string, PackOrigin>();
  /** Pack id → why it failed to load. Only for packs not in `registrations`: registering one removes its entry */
  const loadProblems = new Map<string, string>();
  let admitted = new Map<string, AdmittedPackContributions>();
  let tables = buildContributionTables(admitted.values());
  const bindings = new Map<string, ReturnType<typeof createPackSettingsBinding>>();
  const catalog = createContributionCatalog(appSettingsDefinition);
  catalog.setNative(nativeDeclarations);
  let changing = false;
  function mutate<T>(operation: () => T): T {
    if (changing) throw new Error('A pack registration change is already in progress');
    changing = true;
    try { return operation(); }
    finally { changing = false; }
  }
  const shutdownHooks = createShutdownHooks();

  let catalogDir: string | undefined;

  function refreshCatalog(packsDir = installedPacksDir?.() ?? catalogDir, disabled?: ReadonlySet<string>): void {
    const appSources = appPackSourcesDir?.();
    if (appPackSourcesDir) catalog.setAppPackSources(appSources === undefined
      ? { sources: [], problems: [] } : readAppPackSources(appSources));
    if (!packsDir) return;
    disabled ??= disabledPackIds();
    const sources: PackCatalogSource[] = [];
    const problems: PackCatalogProblem[] = [];
    const previousByDir = new Map(catalog.getSnapshot().packs.map(entry => [entry.dir, entry]));
    for (const entry of readInstalledPackBuilds(packsDir)) {
      const { id, dir } = entry;
      if (entry.build) {
        const { snapshot, integrity } = entry.build;
        sources.push({ snapshot, integrity, dir, enabled: !disabled.has(id) });
      } else {
        const previous = previousByDir.get(dir);
        problems.push({ id, dir, enabled: !disabled.has(id), message: `its declarations were refused: ${entry.problem}` });
        if (previous) sources.push({ snapshot: previous.snapshot, integrity: previous.integrity, dir, enabled: !disabled.has(id) });
      }
    }
    catalog.replace(sources, problems);
    catalogDir = packsDir;
  }


  /** Bumped by every write, so whatever is derived from the registrations is rebuilt on its next read */
  let revision = 0;
  function changed(): void {
    revision++;
  }
  /** `build`'s result, rebuilt only when `stamp` changed since it last ran: by default, when the registrations changed */
  function derived<T>(build: () => T, stamp: () => number = () => revision): () => T {
    let builtAt = NaN;
    let value: T;
    return () => {
      const now = stamp();
      if (builtAt !== now) {
        value = build();
        builtAt = now;
      }
      return value;
    };
  }

  /**
   * Throws when a pack's EARS entry uses a name (key or value) the app or another registered pack declares:
   * the rule the manifest schema and the code generator apply
   */
  function checkEARS(registration: PackRegistration, replacing?: string): void {
    if (!registration.ears) return;
    const kinds = [
      ['entity type', (ears: PackEARS) => ears.entities],
      ['relation kind', (ears: PackEARS) => ears.relKinds],
    ] as const;
    for (const [kind, namesOf] of kinds) {
      const declared = namesOf(registration.ears);
      const [reserved] = _reservedEntries(declared, namesOf(appEARS()));
      if (reserved) throw new Error(`EARS collision: ${kind} ${reserved} — pack "${registration.id}" vs the app's own`);
      for (const [existingId, existing] of registrations) {
        if (existingId === replacing) continue;
        const [taken] = existing.ears ? _reservedEntries(declared, namesOf(existing.ears)) : [];
        if (taken) throw new Error(`EARS collision: ${kind} ${taken} — pack "${registration.id}" vs "${existingId}"`);
      }
    }
  }

  /**
   * Every installed external pack in dependency order, computed once per pack set.
   *
   * Ordered over all of them and narrowed afterwards, so a subset's order agrees with the whole and a
   * dependency outside the subset is one the caller isn't acting on anyway. Cached because the sort
   * reports a dependency cycle: computing it per call had activating or reloading any pack re-logging a
   * cycle between two others.
   */
  const orderedPacks = derived((): PackOrigin[] =>
    packContentOrder(
      [...origins.values()]
        .filter((o) => o.manifest)
        // The dependencies are the manifest's, not the origin's own: spreading the origin would leave every
        // pack looking dependency-free, and `dependencies` being optional means nothing would say so
        .map((o) => ({ id: o.id, dependencies: o.manifest!.dependencies, origin: o })),
    ).map(({ origin }) => origin));

  /** The first of `keys` a registered pack already holds in what `held` reads off it, and that pack */
  function firstTaken(keys: readonly string[], held: (reg: AdmittedPackContributions) => ReadonlyMap<string, unknown>, replacing?: string): { key: string; holder: string } | undefined {
    for (const [holder, existing] of admitted) {
      if (holder === replacing) continue;
      const holds = held(existing);
      const key = keys.find((k) => holds.has(k));
      if (key) return { key, holder };
    }
    return undefined;
  }

  function registerPack(registration: PackRegistration, origin?: PackOrigin): void {
    mutate(() => registerContributions(registration, origin, backendBindingProblem));
  }

  /** Register the content facet without claiming backend actors, roles or services. */
  function registerContentRuntime(runtime: ContentRuntime, origin: PackOrigin, appliers?: ContentApplier[]): void {
    const manifest = origin.manifest;
    if (!manifest) throw new Error(`Pack "${origin.id}" content runtime needs accepted manifest declarations`);
    const problem = _packDeclarationProblem(origin, runtime);
    if (problem) throw new Error(problem);
    mutate(() => registerContributions({
      id: runtime.id, declarationRevision: runtime.declarationRevision,
      settings: manifest.extensions?.settings,
      features: Object.fromEntries(Object.entries(manifest.features ?? {})
        .filter(([, feature]) => feature.settings !== undefined).map(([id, feature]) => [id, { settings: feature.settings }])),
      ears: { entities: runtime.entities, relKinds: runtime.relKinds },
      repositories: runtime.repositories, contentWriters: runtime.contentWriters, appliers,
    }, origin, manifest => contentBindingProblem(manifest, runtime, appliers)));
  }

  function registerContributions(registration: PackRegistration, origin: PackOrigin | undefined,
    checkBinding: typeof backendBindingProblem, replacing = false, replacement?: PackReplacementOptions): string[] {
    if (origin) origin = Object.freeze({ ...origin,
      ...(origin.manifest && { manifest: captureData(origin.manifest) }),
      ...(origin.buildFiles && { buildFiles: Object.freeze({ ...origin.buildFiles }) }),
    });
    if (registrations.has(registration.id) && !replacing) {
      throw new Error(`Pack "${registration.id}" is already registered`);
    }
    if (origin && (origin.id !== registration.id || (origin.manifest && origin.manifest.id !== registration.id))) {
      throw new Error(`Pack "${registration.id}" runtime identity does not match its accepted origin "${origin.id}"`);
    }
    const stepBindings = Array.isArray(registration.steps) ? registration.steps.map(captureStepBinding) : registration.steps;
    const checkedRegistration = { ...registration, steps: stepBindings };
    checkFeatureIds(registration.id, Object.keys(registration.features ?? {}));
    if (!origin) {
      const declaration = catalog.getSnapshot().native.find(pack => pack.id === registration.id);
      if (!declaration) throw new Error(`Native pack "${registration.id}" must declare its data before binding`);
      if (!isDeepStrictEqual(registration.ears?.relKinds ?? {}, _packRelationTypes(declaration))) {
        throw new Error(`Native pack "${registration.id}" runtime ears.relKinds does not match its admitted declarations`);
      }
      const commands = commandBindingProblem(declaration.commands, registration.commands);
      if (commands) throw new Error(`Native pack "${registration.id}" runtime ${commands} does not match its admitted declarations`);
      const lifecycleProblem = lifecycleBindingProblem(declaration.lifecycle, registration.lifecycle);
      if (lifecycleProblem) throw new Error(`Native pack "${registration.id}" runtime ${lifecycleProblem} does not match its admitted declarations`);
      const stepProblem = backendStepBindingProblem(declaration.steps, stepBindings);
      if (stepProblem) throw new Error(`Native pack "${registration.id}" runtime ${stepProblem} does not match its admitted declarations`);
      const runtimeFeatures = registration.features === undefined ? {} : registration.features;
      const settingsOf = (features: Record<string, { settings?: unknown }> = {}) => Object.fromEntries(
        Object.entries(features).filter(([, feature]) => feature.settings !== undefined).map(([id, feature]) => [id, feature.settings]));
      if (!runtimeFeatures || typeof runtimeFeatures !== 'object' || Array.isArray(runtimeFeatures)
        || Object.values(runtimeFeatures).some(feature => !feature || typeof feature !== 'object' || Array.isArray(feature))
        || !isDeepStrictEqual(Object.keys(runtimeFeatures).sort(), Object.keys(declaration.features ?? {}).sort())
        || !isDeepStrictEqual(registration.ears?.entities ?? {}, _packEntityTypes(declaration))
        || !isDeepStrictEqual(registration.dependencies === undefined ? {} : registration.dependencies, declaration.dependencies ?? {})
        || !isDeepStrictEqual(registration.settings === undefined ? {} : registration.settings, declaration.settings ?? {})
        || !isDeepStrictEqual(settingsOf(runtimeFeatures), settingsOf(declaration.features))) {
        throw new Error(`Native pack "${registration.id}" runtime does not match its admitted declarations`);
      }
    }


    const source = catalog.getSnapshot().sourcePacks.find(pack => pack.manifest.id === registration.id);
    if (source && (registration.declarationRevision !== source.declarationRevision || origin?.declarationRevision !== source.declarationRevision)) {
      throw new Error(`Pack "${registration.id}" runtime does not match its accepted source declarations`);
    }

    if (origin?.manifest) {
      const definitions = (features: Record<string, { settings?: unknown }> = {}) => Object.fromEntries(
        Object.entries(features).filter(([, feature]) => feature.settings !== undefined).map(([id, feature]) => [id, feature.settings]),
      );
      if (!isDeepStrictEqual(definitions(registration.features), definitions(origin.manifest.features))
        || !isDeepStrictEqual(registration.settings === undefined ? {} : registration.settings, origin.manifest.extensions?.settings ?? {})) {
        throw new Error(`Pack "${registration.id}" runtime settings do not match its accepted declarations`);
      }
      const problem = checkBinding(origin.manifest, checkedRegistration);
      if (problem) throw new Error(problem);
    }

    checkEARS(registration, replacing ? registration.id : undefined);

    const services = Object.keys(registration.services ?? {});
    const hostService = services.find((key) => (HOST_SERVICE_NAMES as readonly string[]).includes(key));
    if (hostService) throw new Error(`Service collision: key "${hostService}" — pack "${registration.id}" vs the host's own "${hostService}" service`);
    const service = firstTaken(services, (reg) => reg.services, replacing ? registration.id : undefined);
    if (service) throw new Error(`Service collision: key "${service.key}" — pack "${registration.id}" vs "${service.holder}"`);
    const repository = firstTaken(Object.keys(registration.repositories ?? {}), (reg) => reg.repositories, replacing ? registration.id : undefined);
    if (repository) throw new Error(`Repository collision: "${repository.key}" — pack "${registration.id}" vs "${repository.holder}"`);

    const candidate = new Map(admitted);
    const declarations = origin ? origin.manifest?.extensions?.steps
      : catalog.getSnapshot().native.find(pack => pack.id === registration.id)?.steps;
    candidate.set(registration.id, admitContributions(checkedRegistration, declarations, origin));
    const nextTables = buildContributionTables(candidate.values());
    let binding: ReturnType<typeof createPackSettingsBinding> | undefined;
    try {
      if (registration.bindSettings) {
        if (!settingsForPack) throw new Error(`Pack "${registration.id}" needs a host settings service binding`);
        binding = createPackSettingsBinding(settingsForPack(registration.id), registration.bindSettings);
      }
      publishRepositories(tables.repositories, nextTables.repositories);
    } catch (error) {
      const failures = binding?.dispose() ?? [];
      if (failures.length) throw new AggregateError([error, ...failures.map(message => new Error(message))], 'Pack admission and provisional cleanup failed');
      throw error;
    }
    const previousBinding = bindings.get(registration.id);
    registrations = new Map(registrations).set(registration.id, registration);
    origins = new Map(origins);
    if (origin) origins.set(registration.id, origin);
    else origins.delete(registration.id);
    admitted = candidate;
    tables = nextTables;
    if (binding) { bindings.set(registration.id, binding); binding.activate(); }
    else bindings.delete(registration.id);
    loadProblems.delete(registration.id);
    changed();
    if (!previousBinding) return [];
    if (!replacement) return previousBinding.dispose();
    try {
      replacement.retireBinding(() => previousBinding.dispose());
      return [];
    } catch (error) {
      return [`Pack "${registration.id}" committed, but binding retirement could not be scheduled: ${String(error)}`];
    }
  }

  function unregisterPack(packId: string): void {
    mutate(() => {
      if (!registrations.has(packId)) throw new Error(`Pack "${packId}" is not registered`);
      const candidate = new Map(admitted);
      candidate.delete(packId);
      const nextTables = buildContributionTables(candidate.values());
      publishRepositories(tables.repositories, nextTables.repositories);
      const binding = bindings.get(packId);
      bindings.delete(packId);
      registrations = new Map(registrations);
      registrations.delete(packId);
      origins = new Map(origins);
      origins.delete(packId);
      admitted = candidate;
      tables = nextTables;
      changed();
      const failures = binding?.dispose() ?? [];
      if (failures.length) throw new Error(`Pack "${packId}" is unregistered, but its binding cleanup failed: ${failures.join('; ')}`);
    });
  }

  function getRegisteredPackSystemIds(packId: string): string[] {
    const reg = registrations.get(packId);
    return reg ? packSystemIds(reg) : [];
  }

  function buildEventValidationMap(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const reg of registrations.values()) {
      for (const { ref, system } of systemsOf(reg)) map.set(ref, new Set(system.receives));
    }
    // The bus isn't a feature's system, but pack code sends it events (HostSystemEvents): from a frontend too, so the
    // client path checks them as the backend's does. It runs where the host is registered.
    if (registrations.has(HOST_PACK_ID)) {
      for (const [ref, types] of Object.entries(HOST_SYSTEM_EVENT_TYPES)) map.set(ref, new Set(types));
    }
    return map;
  }

  function buildPluginEventValidationMap(): Map<string, PluginEventTypes> {
    const map = new Map<string, PluginEventTypes>();
    // Each pack's plugins are under its own refs, the host's included, so no pack reaches another's entry
    for (const reg of registrations.values()) {
      for (const { ref, feature } of featuresOf(reg)) {
        if (feature.plugin) map.set(ref, new Set([...feature.plugin.receives, ...PLUGIN_EVENT_TYPES]));
      }
    }
    return map;
  }

  const eventValidationMap = derived(buildEventValidationMap);
  const pluginEventValidationMap = derived(buildPluginEventValidationMap);
  const entityTypes = derived((): ReadonlySet<string> => new Set<string>([
    ...RESERVED_ENTITIES,
    ...[...registrations.values()].flatMap((reg) => Object.values(reg.ears?.entities ?? {})),
  ]));
  const services = derived((): Record<string, unknown> =>
    Object.fromEntries([...admitted.values()].flatMap(pack => [...pack.services])));

  return {
    catalog,
    refreshCatalog,
    registerPack,
    replacePack: (registration, origin, options) => mutate(() => {
      if (!registrations.has(registration.id)) throw new Error(`Pack "${registration.id}" is not registered`);
      return registerContributions(registration, origin, backendBindingProblem, true, options);
    }),
    registerContentRuntime,
    unregisterPack,

    recordLoadProblem(packId, problem) {
      loadProblems.set(packId, problem);
    },
    loadProblem: (packId) => catalog.getSnapshot().problems.find(problem => problem.id === packId)?.message ?? loadProblems.get(packId),
    clearLoadProblem(packId) {
      loadProblems.delete(packId);
    },

    getRegisteredSystems() {
      const systems = new Map<string, AnyStateMachine>();
      for (const reg of registrations.values()) {
        for (const { ref, system } of systemsOf(reg)) systems.set(ref, system.machine);
      }
      return systems;
    },

    getRegisteredPackSystemIds,
    packOrigin: (packId) => origins.get(packId) ?? null,
    getPackRuntime(packId) {
      const origin = origins.get(packId);
      const contribution = admitted.get(packId);
      return origin && contribution ? { origin, runtimeRevision: contribution.runtimeRevision } : null;
    },
    loadedPacks: () => [...origins.values()],
    packMigrationTargets: (line, packIds) => {
      const wanted = packIds && new Set(packIds);
      return orderedPacks()
        .filter((o) => !wanted || wanted.has(o.id))
        .map((o) => ({ manifest: o.manifest!, migrations: registrations.get(o.id)?.migrations?.[line] }));
    },

    // Both maps are keyed by the registered features' refs, the host's included
    systemIds: () => [...eventValidationMap().keys()] as FeatureRef[],
    pluginIds: () => [...pluginEventValidationMap().keys()] as FeatureRef[],

    getEventValidationMap: eventValidationMap,
    getPluginEventValidationMap: pluginEventValidationMap,

    earsNames() {
      const { entities, relKinds } = appEARS();
      const names = { entities: { ...entities }, relKinds: { ...relKinds } };
      for (const reg of registrations.values()) {
        Object.assign(names.entities, reg.ears?.entities ?? {});
        Object.assign(names.relKinds, reg.ears?.relKinds ?? {});
      }
      return names;
    },

    getRegisteredEntityTypes: entityTypes,
    getRegisteredServices: services,

    getLifecycleHooks: () => [...registrations.values()].flatMap((reg) => (reg.lifecycle ? [reg.lifecycle] : [])),
    getPackRegistration: (packId) => registrations.get(packId) ?? null,

    packContentTargets(packIds) {
      const wanted = packIds && new Set(packIds);
      // Dependency order over every pack. A pack the app ships declares no dependencies — it is what others
      // depend on — so it sorts ahead of them, which is the order the two separate paths used to produce by
      // running one after the other
      const ordered = packContentOrder([...origins.values()]
        .filter((origin) => !wanted || wanted.has(origin.id))
        .map((origin) => ({ id: origin.id, dependencies: origin.manifest?.dependencies, origin })));
      return ordered.map(({ origin }) => ({
        manifest: { id: origin.id, dependencies: origin.manifest?.dependencies },
        dir: origin.dir,
      }));
    },

    ...shutdownHooks,

    // The SDK's lookups (PackRegistryView)
    designation: key => tables.designations.get(key),
    stepDeclarations: catalog.steps,
    stepBindings: () => new Map(tables.steps.entries()),
    step: key => tables.steps.get(key)?.binding,
    steps: () => tables.steps.all().map(row => row.binding),
    artifact: key => tables.artifacts.get(key),
    artifacts: () => tables.artifacts.all(),
    block: key => tables.blocks.get(key),
    blocks: () => tables.blocks.all(),
    contentWriters: key => tables.contentWriters.get(key),
    appliers: key => tables.appliers.get(key),
    settingsCatalog: catalog.settings,
    onCatalogChanged: catalog.onChanged,
    pluginDefaults: derived(() => Object.fromEntries([...registrations.values()].flatMap(reg =>
      featuresOf(reg).filter(({ feature }) => feature.plugin?.defaultVisible !== undefined)
        .map(({ ref, feature }) => [ref, feature.plugin!.defaultVisible!])))),
    commands: () => catalog.commands().filter(command => {
      if (command.enabled === false || !admitted.has(command.packId)) return false;
      if (command.origin === 'native') {
        const declaration = catalog.getSnapshot().native.find(pack => pack.id === command.packId);
        return !commandBindingProblem(declaration?.commands, admitted.get(command.packId)!.commands);
      }
      const origin = origins.get(command.packId);
      return origin !== undefined && origin.declarationRevision === command.declarationRevision
        && origin.buildRevision === command.buildRevision;
    }).map(({ name, placeholder }) => ({ name, placeholder })),
    help: catalog.help,
  };
}
