/**
 * Pack Registration
 *
 * The registered packs, as an instance: the app's composition root, the test harness and the CLI each create one.
 * It holds what packs contributed and the only writes to it (register, unregister), and implements the read-only
 * view the SDK's lookups read once it's bound (`HostRuntime.packs`).
 */

import type { AnyStateMachine } from 'xstate';
import type { PackRegistration, PackBootHooks, PackEARS, PackMigration, PackFeature, PackFeatureSystem, PackSeedManifest } from '@abuddy/sdk/framework';
import type { PackManifest } from '@abuddy/sdk/build';
import type { PackRegistryView } from '@abuddy/sdk/runtime';
import type { HostServices } from '@abuddy/sdk/services';
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { SDK_ENTITIES, SDK_EXCLUDED_ENTITY_TYPES, SDK_REL_KINDS, _reservedEntries } from '@abuddy/sdk/types';
import { HOST_SYSTEM_EVENT_TYPES, PLUGIN_EVENT_TYPES } from '@abuddy/sdk/events';
import { HOST_PACK_ID, resolveName, type FeatureRef } from '@abuddy/sdk/ids';
import { makePolicy, registerRepository, unregisterRepository, type PartitionPolicy } from '@abuddy/ears';
import { HOST_ENTITY_TYPES } from '../app-state/index.ts';
import { packSeedOrder } from './pack-discovery.ts';
import { addContributions, createDefinitionStore, createDesignationStore, createStepStore, definitions, type Contribution, type UndoLog } from './extensions.ts';
import { createCommandStore, createSeedHookStore, createSeederStore, createSettingsDefaultsStore, createShutdownHooks } from './backend-extensions.ts';
import { checkFeatureIds } from './feature-ids.ts';

export type { PackRegistration, PackBootHooks, PackEARS, PackMigration };

/** Services the host supplies itself; a pack service with one of these names would replace it */
const HOST_SERVICE_NAMES = ['logger', 'emitter', 'repository', 'appData', 'traceStore', 'inference', 'secrets', 'filesystem'] as const satisfies readonly (keyof HostServices)[];
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

/** The refs of the systems the bus runs for a registration (all but the early ones), before or after it registers */
export function packSystemIds(reg: PackRegistration): FeatureRef[] {
  return systemsOf(reg).filter(({ system }) => !system.early).map(({ ref }) => ref);
}

/** Role → the ref of the feature playing it: its system and its plugin share it */
function designationsOf(reg: PackRegistration): Record<string, FeatureRef> {
  return Object.fromEntries(featuresOf(reg).flatMap(({ ref, feature }) => (feature.designation ? [[feature.designation, ref]] : [])));
}

/** What the app lists of a pack's feature (the Packs plugin shows it) */
export interface PackFeatureInfo {
  id: string;
  designation?: string;
  hasSystem: boolean;
  hasPlugin: boolean;
  services: readonly string[];
}

function featureInfo(reg: PackRegistration): PackFeatureInfo[] {
  return featuresOf(reg).map(({ featureId, feature }) => ({
    id: featureId,
    ...(feature.designation ? { designation: feature.designation } : {}),
    hasSystem: !!feature.system,
    hasPlugin: !!feature.plugin,
    services: feature.services ?? [],
  }));
}

export interface PackExtensions {
  systems: string[];
  services: string[];
  steps: string[];
  artifacts: string[];
  blocks: string[];
  relKinds: Record<string, string>;
  migrationCount: number;
  bootHooks: string[];
  features: PackFeatureInfo[];
}

export interface PackInfo extends PackExtensions {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  builtIn: boolean;
  entityCount: number;
  /** Whether the pack has frontend code: an external pack's runtime/fe.js, a built-in pack's plugins */
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
  /** Why the last update check couldn't finish or confirm compatibility */
  updateCheckError?: string;
}

/** What a plugin's sends are checked against: the event types it receives */
export type PluginEventTypes = Set<string>;

/**
 * Where the app found a pack, and what the pack says it is. The registration says what a pack contributes;
 * this says where it came from, which only the app knows — `abuddy.json` is not something a pack's own
 * generated registration can see, and a built-in pack has no install directory of its own to report.
 *
 * It is a second argument to `registerPack` rather than a field on `PackRegistration` because that type is
 * the pack contract: `generate-entries` writes it into every pack and `etc/framework.api.md` pins it.
 */
export interface PackOrigin {
  id: string;
  name: string;
  version: string;
  /** Where the pack's files are: `packs/<id>` for an external pack, `host-packs/<id>` for a built-in one */
  dir: string;
  builtIn: boolean;
  /** An external pack's `abuddy.json`, which its loader read to find the pack at all */
  manifest?: PackManifest;
}

/** The registered packs, the host's own (`hostRegistration`) among them, and their shutdown hooks */
export interface PackRegistry extends PackRegistryView {
  /** Registers a pack; throws on a collision, registering none of it */
  registerPack(pack: PackRegistration, origin?: PackOrigin): void;
  unregisterPack(packId: string): void;
  /**
   * Notes that a pack is being replaced, so the plugins it owns are expected to be missing until its
   * replacement registers. Cleared when the pack registers again, or is torn down for good.
   */
  markPackReplacing(packId: string): void;
  /**
   * Whether a plugin's pack is mid-replacement. A send to it is still dropped — its systems are
   * stopped and there is nothing to receive — but it is an expected drop, not a mistake to report.
   */
  isPluginReplacing(pluginId: string): boolean;
  /** Ends a replacement window, whether or not anything took the pack's place */
  clearPackReplacing(packId: string): void;
  /** Host systems and every registered pack's that the bus runs, by id: all but the early ones */
  getRegisteredSystems(): Map<string, AnyStateMachine>;
  /** The registered packs' early systems (`system.early`), which the app starts before hydration and outside the bus */
  getEarlySystems(): Array<{ id: FeatureRef; machine: AnyStateMachine }>;
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
  readonly partitionPolicy: PartitionPolicy;
  getBootHooks(): PackBootHooks[];
  /** A registered pack's registration, as it was registered */
  getPackRegistration(packId: string): PackRegistration | null;
  /** Where a registered pack came from, or `null` for one registered without an origin (a test's) */
  packOrigin(packId: string): PackOrigin | null;
  /** The built-in packs this app loaded, in registration order */
  builtInPacks(): PackOrigin[];
  /** The external packs this app loaded, in registration order */
  externalPacks(): PackOrigin[];
  /**
   * Each registered external pack as the runtime's per-pack helpers take it: where it came from, plus the
   * migrations it registered. One place joins the two halves, so no caller holds its own list of packs.
   * With `packIds`, only those — activation and reload migrate and seed the one pack they handled.
   *
   * In dependency order (`packSeedOrder`), so a pack's migrations and seeds run after those of the packs
   * it depends on: its seeds may reference what they seeded. Registration order, which decides who wins a
   * designation or a plugin id, is a different order and is not this.
   */
  externalPackTargets(packIds?: Iterable<string>): Array<{ manifest: PackManifest; dir: string; migrations?: PackMigration[] }>;
  /**
   * Seeds each registered pack's declarative boot seed (`boot.seedManifest`, built-in packs only: the
   * loader strips it from external packs, which seed through `seedPackData`)
   */
  runRegisteredBootSeeds(orchestrateSeed: (manifest: PackSeedManifest, packId: string) => void): void;
  getPackExtensions(packId: string): PackExtensions | null;
  /** Registers a hook run when the pack `key` stops, or, without a key, when the app exits */
  registerShutdownHook(hook: () => void, key?: string): void;
  /** Runs every registered shutdown hook (the app exiting) */
  runShutdownHooks(): void;
  /** Runs and removes a pack's shutdown hooks (the pack stopping) */
  runShutdownHooksForKey(key: string): void;
  /** Removes a pack's shutdown hooks without running them */
  removeShutdownHooksForKey(key: string): void;
}

/**
 * The app's partition policy for the entity types packs exclude (`ears.partitionPolicy.excludedEntityTypes`, the
 * built-in packs'): those and the SDK's volatile types live in the volatile partition
 */
export function appPartitionPolicy(packExcluded: Iterable<string>): PartitionPolicy {
  return makePolicy({ excludedEntityTypes: new Set([...SDK_EXCLUDED_ENTITY_TYPES, ...packExcluded]) });
}

/** A new, empty registry */
export function createPackRegistry(): PackRegistry {
  const registrations = new Map<string, PackRegistration>();
  /** Where each registered pack came from. Same keys as `registrations`, so it comes and goes with them */
  const origins = new Map<string, PackOrigin>();
  /** Pack id → the plugins it owned when it was torn down to be replaced (an update's download window) */
  const replacingPacks = new Map<string, Set<string>>();
  const designations = createDesignationStore();
  const steps = createStepStore();
  const artifacts = createDefinitionStore<ArtifactDefinition>();
  const blocks = createDefinitionStore<BlockDefinition>();
  const seedHooks = createSeedHookStore();
  const seeders = createSeederStore();
  const settingsDefaults = createSettingsDefaultsStore();
  const commands = createCommandStore();
  const shutdownHooks = createShutdownHooks();

  /** Bumped by every write, so whatever is derived from the registrations is rebuilt on its next read */
  let revision = 0;
  function changed(): void {
    revision++;
  }
  /** `build`'s result, rebuilt only when the registrations changed since it last ran */
  function derived<T>(build: () => T): () => T {
    let builtAt = -1;
    let value: T;
    return () => {
      if (builtAt !== revision) {
        value = build();
        builtAt = revision;
      }
      return value;
    };
  }

  /**
   * Throws when a pack's EARS entry uses a name (key or value) the app or another registered pack declares:
   * the rule the manifest schema and the code generator apply
   */
  function checkEARS(registration: PackRegistration): void {
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
  const orderedExternalPacks = derived((): PackOrigin[] =>
    packSeedOrder(
      [...origins.values()]
        .filter((o) => !o.builtIn && o.manifest)
        // The dependencies are the manifest's, not the origin's own: spreading the origin would leave every
        // pack looking dependency-free, and `dependencies` being optional means nothing would say so
        .map((o) => ({ id: o.id, dependencies: o.manifest!.dependencies, origin: o })),
    ).map(({ origin }) => origin));

  /** Each pack's undos, as its registration produced them */
  const packUndos = new Map<string, UndoLog>();

  /**
   * Everything a registration contributes, and how to take exactly that back out.
   *
   * Each entry registers its own kind and hands `undo` the way to remove what it just did. Both paths that
   * remove a pack run those undos — the rollback when a later entry throws, and `unregisterPack` — so a new
   * kind of contribution is one entry here rather than one line in each of three lists that nothing checks
   * agree.
   *
   * The undos are recorded as the work happens, not returned at the end, because an entry can throw partway
   * through its own items: the seed hooks of one pack are refused one entity at a time. And they undo what
   * the `add` did rather than re-reading the registration, because a pack refused for a step collision must
   * not unregister the step it collided with.
   */
  const contributions: ReadonlyArray<Contribution<PackRegistration>> = [
    // First, so a role another pack plays refuses the pack before any contribution a running system observes
    (reg, undo) => {
      const roles = designationsOf(reg);
      designations.register(roles);
      undo(() => designations.unregister(roles));
    },
    // Into the installed engine (the app's), before anything that may use them
    (reg, undo) => {
      for (const [name, repo] of Object.entries(reg.repositories ?? {})) {
        registerRepository(name, repo);
        undo(() => unregisterRepository(name));
      }
    },
    definitions(steps, (reg) => reg.steps),
    definitions(artifacts, (reg) => reg.artifacts),
    definitions(blocks, (reg) => reg.blocks),
    (reg, undo) => {
      // Registered one entity at a time and refused the same way, so the undo is in place before the first
      undo(() => seedHooks.unregisterAll(reg.id));
      for (const [entity, hooks] of Object.entries(reg.seedHooks ?? {})) seedHooks.register(entity, hooks, reg.id);
    },
    (reg, undo) => { undo(() => seeders.unregister(reg.id)); seeders.register(reg.id, reg.seeders ?? []); },
    (reg, undo) => { undo(() => commands.unregister(reg.id)); commands.register(reg.id, reg.commands ?? []); },
    (reg, undo) => {
      undo(() => settingsDefaults.unregister(reg.id));
      settingsDefaults.register(reg.id, featuresOf(reg).map(({ featureId, feature }) => ({ id: featureId, settings: feature.settings })));
    },
  ];

  /** The first of `keys` a registered pack already holds in what `held` reads off it, and that pack */
  function firstTaken(keys: readonly string[], held: (reg: PackRegistration) => object | undefined): { key: string; holder: string } | undefined {
    for (const [holder, existing] of registrations) {
      const holds = held(existing) ?? {};
      const key = keys.find((k) => k in holds);
      if (key) return { key, holder };
    }
    return undefined;
  }

  function registerPack(registration: PackRegistration, origin?: PackOrigin): void {
    if (registrations.has(registration.id)) {
      throw new Error(`Pack "${registration.id}" is already registered`);
    }
    checkFeatureIds(registration.id, Object.keys(registration.features ?? {}));

    checkEARS(registration);

    const services = Object.keys(registration.services ?? {});
    const hostService = services.find((key) => (HOST_SERVICE_NAMES as readonly string[]).includes(key));
    if (hostService) throw new Error(`Service collision: key "${hostService}" — pack "${registration.id}" vs the host's own "${hostService}" service`);
    const service = firstTaken(services, (reg) => reg.services);
    if (service) throw new Error(`Service collision: key "${service.key}" — pack "${registration.id}" vs "${service.holder}"`);
    const repository = firstTaken(Object.keys(registration.repositories ?? {}), (reg) => reg.repositories);
    if (repository) throw new Error(`Repository collision: "${repository.key}" — pack "${registration.id}" vs "${repository.holder}"`);

    /**
     * Listed before its extensions are registered, because registering them is observable: a running system
     * that reacts (the settings system, to new feature settings) sends inside this call, and the bus checks
     * that send against the registry synchronously. Listed after, the send would belong to no registered
     * pack and be dropped.
     */
    registrations.set(registration.id, registration);
    if (origin) origins.set(registration.id, origin);
    replacingPacks.delete(registration.id);
    changed();

    let undos: UndoLog;
    try {
      // Only what this call registered comes back out: a pack refused for a step collision must not unregister the
      // step it collided with
      undos = addContributions(registration, contributions);
    } catch (err) {
      // A refused pack leaves nothing of itself behind, its origin included — one left here would name a pack the
      // app never registered as one it loaded
      registrations.delete(registration.id);
      origins.delete(registration.id);
      changed();
      throw err;
    }
    packUndos.set(registration.id, undos);
    changed();
  }

  function unregisterPack(packId: string): void {
    if (!registrations.has(packId)) throw new Error(`Pack "${packId}" is not registered`);

    // The undos its registration produced, not a second reading of the registration: what comes out is
    // exactly what went in
    const failures = packUndos.get(packId)?.undoAll() ?? [];
    packUndos.delete(packId);

    registrations.delete(packId);
    origins.delete(packId);
    changed();

    if (failures.length > 0) {
      throw new Error(`Pack "${packId}" is unregistered, but ${failures.length} of its contributions could not be taken back out: ${failures.join('; ')}`);
    }
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

  function ownedPluginIds(reg: PackRegistration): string[] {
    return featuresOf(reg).filter(({ feature }) => feature.plugin).map(({ ref }) => ref);
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

  function getRegisteredEARSPolicy(): { excludedEntityTypes: string[] } {
    const excluded: string[] = [...SDK_EXCLUDED_ENTITY_TYPES];
    for (const reg of registrations.values()) {
      if (reg.ears?.partitionPolicy?.excludedEntityTypes) excluded.push(...reg.ears.partitionPolicy.excludedEntityTypes);
    }
    return { excludedEntityTypes: excluded };
  }

  const policy = derived((): PartitionPolicy => appPartitionPolicy(getRegisteredEARSPolicy().excludedEntityTypes));
  const eventValidationMap = derived(buildEventValidationMap);
  const pluginEventValidationMap = derived(buildPluginEventValidationMap);
  const entityTypes = derived((): ReadonlySet<string> => new Set<string>([
    ...RESERVED_ENTITIES,
    ...[...registrations.values()].flatMap((reg) => Object.values(reg.ears?.entities ?? {})),
  ]));
  const services = derived((): Record<string, unknown> =>
    Object.assign({}, ...[...registrations.values()].map((reg) => reg.services ?? {})));

  return {
    registerPack,
    unregisterPack,

    markPackReplacing(packId) {
      const reg = registrations.get(packId);
      if (reg) replacingPacks.set(packId, new Set(ownedPluginIds(reg)));
    },

    isPluginReplacing(pluginId) {
      for (const plugins of replacingPacks.values()) if (plugins.has(pluginId)) return true;
      return false;
    },

    clearPackReplacing(packId) {
      replacingPacks.delete(packId);
    },

    getRegisteredSystems() {
      const systems = new Map<string, AnyStateMachine>();
      for (const reg of registrations.values()) {
        for (const { ref, system } of systemsOf(reg)) if (!system.early) systems.set(ref, system.machine);
      }
      return systems;
    },

    getEarlySystems: () => [...registrations.values()].flatMap((reg) =>
      systemsOf(reg).flatMap(({ ref, system }) => (system.early ? [{ id: ref, machine: system.machine }] : []))),

    getRegisteredPackSystemIds,
    packOrigin: (packId) => origins.get(packId) ?? null,
    builtInPacks: () => [...origins.values()].filter((o) => o.builtIn),
    externalPacks: () => [...origins.values()].filter((o) => !o.builtIn),
    externalPackTargets: (packIds) => {
      const wanted = packIds && new Set(packIds);
      return orderedExternalPacks()
        .filter((o) => !wanted || wanted.has(o.id))
        .map((o) => ({ manifest: o.manifest!, dir: o.dir, migrations: registrations.get(o.id)?.migrations }));
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

    partitionPolicy: {
      routeEntity: (...args) => policy().routeEntity(...args),
      routeRelation: (...args) => policy().routeRelation(...args),
      get hydrate() { return policy().hydrate; },
    },

    getBootHooks: () => [...registrations.values()].flatMap((reg) => (reg.boot ? [reg.boot] : [])),
    getPackRegistration: (packId) => registrations.get(packId) ?? null,

    runRegisteredBootSeeds(orchestrateSeed) {
      for (const reg of registrations.values()) {
        if (reg.boot?.seedManifest) orchestrateSeed(reg.boot.seedManifest, reg.id);
      }
    },

    getPackExtensions(packId) {
      const reg = registrations.get(packId);
      if (!reg) return null;

      const bootHooks: string[] = [];
      if (reg.boot?.onInit) bootHooks.push('onInit');
      if (reg.boot?.seedManifest) bootHooks.push('seedManifest');
      if (reg.boot?.onShutdown) bootHooks.push('onShutdown');

      return {
        systems: systemsOf(reg).map(({ ref }) => ref),
        services: reg.services ? Object.keys(reg.services) : [],
        steps: (reg.steps ?? []).map(s => s.type),
        artifacts: (reg.artifacts ?? []).map(a => a.type),
        blocks: (reg.blocks ?? []).map(b => b.type),
        relKinds: reg.ears?.relKinds ?? {},
        migrationCount: reg.migrations?.length ?? 0,
        bootHooks,
        features: featureInfo(reg),
      };
    },

    ...shutdownHooks,

    // The SDK's lookups (PackRegistryView)
    designation: designations.get,
    step: steps.get,
    steps: steps.all,
    artifact: artifacts.get,
    artifacts: artifacts.all,
    block: blocks.get,
    blocks: blocks.all,
    seedHooks: seedHooks.get,
    seeders: seeders.get,
    settingsDefaults: settingsDefaults.get,
    onSettingsDefaultsChanged: settingsDefaults.onChanged,
    commands: commands.all,
  };
}
