/**
 * Pack Registration
 *
 * The registered packs, as an instance: the app's composition root, the test harness and the CLI each create one.
 * It holds what packs contributed and the only writes to it (register, unregister), and implements the read-only
 * view the SDK's lookups read once it's bound (`HostRuntime.packs`).
 */

import type { AnyStateMachine } from 'xstate';
import type { PackRegistration, PackBootHooks, PackEARS, PackMigration, PackFeatureDef, PackSeedManifest } from '@abuddy/sdk/framework';
import type { PackRegistryView } from '@abuddy/sdk/runtime';
import type { HostServices } from '@abuddy/sdk/services';
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { SDK_ENTITIES, SDK_EXCLUDED_ENTITY_TYPES, SDK_REL_KINDS, _reservedEntries } from '@abuddy/sdk/types';
import { HOST_PLUGIN_EVENT_TYPES } from '@abuddy/sdk/events';
import { makePolicy, registerRepository, unregisterRepository, type PartitionPolicy } from '@abuddy/ears';
import { HOST_ENTITY_TYPES } from '../app-state/index.ts';
import { createDefinitionStore, createDesignationStore, createStepStore } from './contributions.ts';
import { createCommandStore, createSeedHookStore, createSeederStore, createSettingsDefaultsStore, createShutdownHooks } from './backend-contributions.ts';

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

/**
 * Role → id of the system that plays it (`<packId>.<featureId>` for an external pack). A designated
 * feature with no registered system (the early system) resolves to its feature id.
 */
function designationsOf({ id, systems, features = [] }: PackRegistration): Record<string, string> {
  const systemId = (featureId: string) =>
    systems.find((s) => s.id === featureId || s.id === `${id}.${featureId}`)?.id ?? featureId;
  return Object.fromEntries([
    ...systems.filter((s) => s.designation).map((s) => [s.designation!, s.id]),
    ...features.filter((f) => f.designation).map((f) => [f.designation!, systemId(f.id)]),
  ]);
}

export interface PackContributions {
  systems: string[];
  services: string[];
  steps: string[];
  artifacts: string[];
  blocks: string[];
  relKinds: Record<string, string>;
  migrationCount: number;
  bootHooks: string[];
  features: PackFeatureDef[];
}

export interface PackInfo {
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
  systems: string[];
  services: string[];
  steps: string[];
  artifacts: string[];
  blocks: string[];
  migrationCount: number;
  bootHooks: string[];
  features: PackFeatureDef[];
  dir?: string;
  registeredAt?: string;
  source?: string;
  availableVersion?: string;
  /** Why the last update check couldn't finish or confirm compatibility */
  updateCheckError?: string;
}

/**
 * What a plugin's sends are checked against: the event types it receives, or `null` for a plugin whose
 * pack declared none.
 *
 * `null` is a pack built before `receivedEventTypes` existed. Its plugin ids are still known, because
 * codegen has always emitted `features`, so the app can tell "this pack declared nothing" from "nobody
 * owns this id" and pass the first through instead of dropping every event the pack sends. Rejecting
 * such a pack instead would be a worse trade: at runtime the user can't rebuild it, so the pack would
 * simply be lost.
 */
export type PluginEventTypes = Set<string> | null;

/** The registered packs, and the app's host systems and shutdown hooks */
export interface PackRegistry extends PackRegistryView {
  /** Registers a pack; throws on a collision, registering none of it */
  registerPack(pack: PackRegistration): void;
  unregisterPack(packId: string): void;
  registerHostSystem(id: string, machine: AnyStateMachine, events: Set<string>): void;
  /**
   * Declares a plugin the host owns and the event types it receives, so the host's own systems are
   * checked like a pack's. Separate from `HOST_PLUGIN_EVENT_TYPES`, which is the subset a pack may
   * name in `sendsTo`: a plugin registered here is the host's to send to and no pack's.
   */
  registerHostPlugin(pluginId: string, types: Iterable<string>): void;
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
  /** Host systems and every registered pack's, by id */
  getRegisteredSystems(): Map<string, AnyStateMachine>;
  /** The bus ids of a registered pack's systems (external packs' are `<packId>.<featureId>`) */
  getRegisteredPackSystemIds(packId: string): string[];
  /**
   * Each registered system's id → the incoming event types it accepts (`*` accepts any). Cached until a
   * pack or host system registers or a pack unregisters.
   */
  getEventValidationMap(): Map<string, Set<string>>;
  /**
   * Each plugin's id → the event types it receives, the outgoing counterpart of `getEventValidationMap`.
   * A pack declares its own plugins' (`PackRegistration.receivedEventTypes`, generated from its systems'
   * outgoing unions) and the host declares its own. Cached on the same terms as the incoming map.
   *
   * A plugin absent from the map is one no registered pack owns. `null` is different: the plugin's pack
   * owns it but declared no event types, which is a pack built before they existed — there is nothing to
   * check it against, so its sends pass. See `PluginEventTypes`.
   */
  getPluginEventValidationMap(): Map<string, PluginEventTypes>;
  /** The SDK's entity types, the host's and the registered packs' */
  getRegisteredEntityTypes(): ReadonlySet<string>;
  getRegisteredEARSPolicy(): { excludedEntityTypes: string[] };
  /**
   * The app's partition policy, from the registered packs' EARS policies: an entity type any of them
   * excludes lives in the volatile partition. It's one object for the registry's lifetime, which the LMDB store
   * is opened with, and each call reads the policy of the packs registered then (cached until a pack
   * registers or unregisters).
   */
  readonly partitionPolicy: PartitionPolicy;
  /**
   * The migrations of the named registered packs. The host runner asks for the built-in packs',
   * checked against the app version; an external pack's migrations are checked against its own
   * pack version by `runPackMigrations`, so asking for every registered pack would run them twice.
   */
  getRegisteredMigrations(packIds: Iterable<string>): PackMigration[];
  getBootHooks(): PackBootHooks[];
  getPackBootHooks(packId: string): PackBootHooks | null;
  /** A registered pack's registration, as it was registered */
  getPackRegistration(packId: string): PackRegistration | null;
  /**
   * Seeds each registered pack's declarative boot seed (`boot.seedManifest`, built-in packs only: the
   * loader strips it from external packs, which seed through `seedPackData`)
   */
  runRegisteredBootSeeds(orchestrateSeed: (manifest: PackSeedManifest, packId: string) => void): void;
  getPackContributions(packId: string): PackContributions | null;
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
  const hostSystems = new Map<string, { machine: AnyStateMachine; events: Set<string> }>();
  const hostPlugins = new Map<string, Set<string>>();
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

  let entityTypeCache: Set<string> | null = null;
  let servicesCache: Record<string, unknown> | null = null;
  let eventValidationMap: Map<string, Set<string>> | null = null;
  let pluginEventValidationMap: Map<string, PluginEventTypes> | null = null;
  let policyCache: PartitionPolicy | null = null;

  /** Drops what's derived from the registrations */
  function changed(): void {
    entityTypeCache = null;
    servicesCache = null;
    eventValidationMap = null;
    pluginEventValidationMap = null;
    policyCache = null;
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

  function registerPack(registration: PackRegistration): void {
    if (registrations.has(registration.id)) {
      throw new Error(`Pack "${registration.id}" is already registered`);
    }

    checkEARS(registration);

    const roles = designationsOf(registration);
    for (const [existingId, existing] of registrations) {
      const held = designationsOf(existing);
      const role = Object.keys(roles).find((r) => r in held);
      if (role) throw new Error(`Designation collision: role "${role}" — pack "${registration.id}" vs "${existingId}"`);
    }

    if (registration.services) {
      for (const key of Object.keys(registration.services)) {
        if ((HOST_SERVICE_NAMES as readonly string[]).includes(key)) {
          throw new Error(`Service collision: key "${key}" — pack "${registration.id}" vs the host's own "${key}" service`);
        }
      }
      for (const [existingId, existing] of registrations) {
        if (!existing.services) continue;
        for (const key of Object.keys(registration.services)) {
          if (key in existing.services) {
            throw new Error(`Service collision: key "${key}" — pack "${registration.id}" vs "${existingId}"`);
          }
        }
      }
    }

    for (const [existingId, existing] of registrations) {
      const name = Object.keys(registration.repositories ?? {}).find((n) => n in (existing.repositories ?? {}));
      if (name) throw new Error(`Repository collision: "${name}" — pack "${registration.id}" vs "${existingId}"`);
    }

    const registeredRepositories: string[] = [];
    const registeredSteps: string[] = [];
    const registeredArtifacts: string[] = [];
    const registeredBlocks: string[] = [];

    /**
     * The pack is listed before its contributions are registered, because registering them is
     * observable: `settingsDefaults.register` notifies its listeners, the settings system reacts by
     * sending `SETTINGS_UPDATED` to its plugin, and a send reaches the bus while it is idle, so the
     * bus processes it synchronously — inside this call. Listed last, as it used to be, that send was
     * checked against a registry that did not yet contain the pack sending it, and was dropped as
     * belonging to no plugin. Reporting that drop logs, and a log event is itself a send to the logs
     * plugin, so the same moment dropped that too.
     *
     * It reads as a reload bug because reload is where it shows: the listeners are already subscribed
     * by then. It is not — it is any registration whose contributions wake a running system.
     */
    registrations.set(registration.id, registration);
    replacingPacks.delete(registration.id);
    changed();

    try {
      // Into the installed engine (the app's), before anything that may use them
      for (const [name, repo] of Object.entries(registration.repositories ?? {})) {
        registerRepository(name, repo);
        registeredRepositories.push(name);
      }

      for (const step of registration.steps ?? []) {
        steps.register(step);
        registeredSteps.push(step.type);
      }
      for (const art of registration.artifacts ?? []) {
        artifacts.register(art);
        registeredArtifacts.push(art.type);
      }
      for (const block of registration.blocks ?? []) {
        blocks.register(block);
        registeredBlocks.push(block.type);
      }
      for (const [entity, hooks] of Object.entries(registration.seedHooks ?? {})) {
        seedHooks.register(entity, hooks, registration.id);
      }
      seeders.register(registration.id, registration.seeders ?? []);
      commands.register(registration.id, registration.commands ?? []);
      settingsDefaults.register(registration.id, registration.features ?? []);
    } catch (err) {
      commands.unregister(registration.id);
      settingsDefaults.unregister(registration.id);
      seeders.unregister(registration.id);
      seedHooks.unregisterAll(registration.id);
      for (const type of registeredSteps) steps.unregister(type);
      for (const type of registeredArtifacts) artifacts.unregister(type);
      for (const type of registeredBlocks) blocks.unregister(type);
      for (const name of registeredRepositories) unregisterRepository(name);
      // Listed above, so the rollback takes it back out: a refused pack leaves nothing of itself behind
      registrations.delete(registration.id);
      changed();
      throw err;
    }

    designations.register(roles);
    changed();
  }

  function unregisterPack(packId: string): void {
    const reg = registrations.get(packId);
    if (!reg) throw new Error(`Pack "${packId}" is not registered`);

    for (const step of reg.steps ?? []) steps.unregister(step.type);
    for (const art of reg.artifacts ?? []) artifacts.unregister(art.type);
    for (const block of reg.blocks ?? []) blocks.unregister(block.type);
    for (const name of Object.keys(reg.repositories ?? {})) unregisterRepository(name);
    seedHooks.unregisterAll(packId);
    seeders.unregister(packId);
    settingsDefaults.unregister(packId);
    commands.unregister(packId);
    designations.unregister(designationsOf(reg));

    registrations.delete(packId);
    changed();
  }

  function getRegisteredPackSystemIds(packId: string): string[] {
    return (registrations.get(packId)?.systems ?? []).map((sys) => sys.id);
  }

  function buildEventValidationMap(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const [id, entry] of hostSystems) {
      map.set(id, entry.events);
    }
    for (const reg of registrations.values()) {
      for (const sys of reg.systems) {
        map.set(sys.id, sys.events);
      }
      if (reg.boot?.earlySystem) {
        const m = reg.boot.earlySystem;
        map.set(m.id, new Set(m.events));
      }
    }
    return map;
  }

  /**
   * The plugins a pack owns: the ones it declares events for, and the ones its `features` name.
   *
   * `features` is what makes the second half matter. Codegen has always emitted it, and it predates
   * `receivedEventTypes`, so a pack built before event declarations existed still says which plugins are
   * its own — which is how the app tells "this pack declared nothing" from "nobody owns this id" instead
   * of dropping every event such a pack sends. A hand-written registration may name only one of the two,
   * so neither is required to be the complete record.
   *
   * Owning an id is not claiming one: the map below gives it to whoever had it first, the host included.
   */
  function ownedPluginIds(reg: PackRegistration): string[] {
    const ids = new Set<string>(Object.keys(reg.receivedEventTypes ?? {}));
    for (const feature of reg.features ?? []) if (feature.hasPlugin) ids.add(feature.id);
    return [...ids];
  }

  /** Every plugin the host owns: those a pack may `sendsTo`, and those only the host sends to */
  function hostPluginEventTypes(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    // Pinned to HostPluginEvents by a compile-time check in @abuddy/sdk/events
    for (const [pluginId, types] of Object.entries(HOST_PLUGIN_EVENT_TYPES)) map.set(pluginId, new Set<string>(types));
    for (const [pluginId, types] of hostPlugins) map.set(pluginId, new Set(types));
    return map;
  }

  function buildPluginEventValidationMap(): Map<string, PluginEventTypes> {
    const map = new Map<string, PluginEventTypes>(hostPluginEventTypes());
    /**
     * Each pack contributes only the plugins it owns, and never one already claimed — the host's are in
     * first, then packs in registration order. The merge this replaced unioned every `receivedEventTypes`
     * key into one set per plugin id, so any pack could add event types to any plugin, `application`
     * included, whatever the comment above it claimed.
     *
     * A pack shadowing another's plugin id isn't refused, because a pack feature may share an id with
     * another pack's plugin (default-setup's settings defaults resolve that in the app's favour). Here
     * the first owner simply keeps the id, so shadowing can't widen what the owner declared.
     */
    for (const reg of registrations.values()) {
      const declared = reg.receivedEventTypes;
      for (const pluginId of ownedPluginIds(reg)) {
        if (map.has(pluginId)) continue;
        map.set(pluginId, declared ? new Set(declared[pluginId] ?? []) : null);
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

  const policy = (): PartitionPolicy =>
    policyCache ??= appPartitionPolicy(getRegisteredEARSPolicy().excludedEntityTypes);

  return {
    registerPack,
    unregisterPack,

    registerHostSystem(id, machine, events) {
      if (hostSystems.has(id)) {
        throw new Error(`Host system "${id}" is already registered`);
      }
      hostSystems.set(id, { machine, events });
      eventValidationMap = null;
    },

    registerHostPlugin(pluginId, types) {
      hostPlugins.set(pluginId, new Set(types));
      pluginEventValidationMap = null;
    },

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
      for (const [id, entry] of hostSystems) systems.set(id, entry.machine);
      for (const reg of registrations.values()) {
        for (const sys of reg.systems) systems.set(sys.id, sys.machine);
      }
      return systems;
    },

    getRegisteredPackSystemIds,

    resolveSystemAddress(address) {
      const slash = address.indexOf('/');
      if (slash <= 0) return undefined;
      const packId = address.slice(0, slash);
      const featureId = address.slice(slash + 1);
      return getRegisteredPackSystemIds(packId).find((id) => id === featureId || id === `${packId}.${featureId}`);
    },

    getEventValidationMap: () => eventValidationMap ??= buildEventValidationMap(),
    getPluginEventValidationMap: () => pluginEventValidationMap ??= buildPluginEventValidationMap(),

    earsNames() {
      const { entities, relKinds } = appEARS();
      const names = { entities: { ...entities }, relKinds: { ...relKinds } };
      for (const reg of registrations.values()) {
        Object.assign(names.entities, reg.ears?.entities ?? {});
        Object.assign(names.relKinds, reg.ears?.relKinds ?? {});
      }
      return names;
    },

    getRegisteredEntityTypes() {
      if (!entityTypeCache) {
        entityTypeCache = new Set<string>(RESERVED_ENTITIES);
        for (const reg of registrations.values()) {
          for (const val of Object.values(reg.ears?.entities ?? {})) entityTypeCache.add(val);
        }
      }
      return entityTypeCache;
    },

    getRegisteredServices() {
      if (!servicesCache) {
        servicesCache = {};
        for (const reg of registrations.values()) {
          if (reg.services) Object.assign(servicesCache, reg.services);
        }
      }
      return servicesCache;
    },

    getRegisteredEARSPolicy,

    partitionPolicy: {
      routeEntity: (...args) => policy().routeEntity(...args),
      routeRelation: (...args) => policy().routeRelation(...args),
      get hydrate() { return policy().hydrate; },
    },

    getRegisteredMigrations(packIds) {
      const migrations: PackMigration[] = [];
      for (const id of packIds) {
        const reg = registrations.get(id);
        if (reg?.migrations) migrations.push(...reg.migrations);
      }
      return migrations;
    },

    getBootHooks: () => [...registrations.values()].flatMap((reg) => (reg.boot ? [reg.boot] : [])),
    getPackBootHooks: (packId) => registrations.get(packId)?.boot ?? null,
    getPackRegistration: (packId) => registrations.get(packId) ?? null,

    runRegisteredBootSeeds(orchestrateSeed) {
      for (const reg of registrations.values()) {
        if (reg.boot?.seedManifest) orchestrateSeed(reg.boot.seedManifest, reg.id);
      }
    },

    getPackContributions(packId) {
      const reg = registrations.get(packId);
      if (!reg) return null;

      const bootHooks: string[] = [];
      if (reg.boot?.earlySystem) bootHooks.push('earlySystem');
      if (reg.boot?.onInit) bootHooks.push('onInit');
      if (reg.boot?.seedManifest) bootHooks.push('seedManifest');
      if (reg.boot?.onShutdown) bootHooks.push('onShutdown');

      return {
        systems: reg.systems.map(s => s.id),
        services: reg.services ? Object.keys(reg.services) : [],
        steps: (reg.steps ?? []).map(s => s.type),
        artifacts: (reg.artifacts ?? []).map(a => a.type),
        blocks: (reg.blocks ?? []).map(b => b.type),
        relKinds: reg.ears?.relKinds ?? {},
        migrationCount: reg.migrations?.length ?? 0,
        bootHooks,
        features: reg.features ?? [],
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
