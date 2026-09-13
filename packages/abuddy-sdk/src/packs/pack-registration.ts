/**
 * Pack Registration
 *
 * Mutable registry where packs declare what they contribute.
 * API core reads from this instead of importing from registries directly.
 */

import type { PackRegistration, PackBootHooks, PackEARS, PackMigration, PackFeatureDef, PackSeedManifest } from '../framework/index.js';
import { registerDesignations, unregisterDesignations } from '../designations/index.js';
import { stepRegistry } from '../steps/index.js';
import { artifactRegistry } from '../artifacts/index.js';
import { blockRegistry } from '../blocks/index.js';

export type { PackRegistration, PackBootHooks, PackEARS, PackMigration };

const registrations = new Map<string, PackRegistration>();
const hostSystems = new Map<string, { machine: import('xstate').AnyStateMachine; events: Set<string> }>();

let _entityTypeCache: Set<string> | null = null;
let _servicesCache: Record<string, unknown> | null = null;

export function registerHostSystem(
  id: string,
  machine: import('xstate').AnyStateMachine,
  events: Set<string>,
): void {
  if (hostSystems.has(id)) {
    throw new Error(`Host system "${id}" is already registered`);
  }
  hostSystems.set(id, { machine, events });
}

export function registerPack(registration: PackRegistration): void {
  if (registrations.has(registration.id)) {
    throw new Error(`Pack "${registration.id}" is already registered`);
  }

  if (registration.ears) {
    for (const [existingId, existing] of registrations) {
      if (!existing.ears) continue;
      const existingEntValues = Object.values(existing.ears.entities);
      for (const val of Object.values(registration.ears.entities)) {
        if (existingEntValues.includes(val)) {
          throw new Error(`EARS collision: entity type "${val}" — pack "${registration.id}" vs "${existingId}"`);
        }
      }
      const existingRelValues = Object.values(existing.ears.relKinds);
      for (const val of Object.values(registration.ears.relKinds)) {
        if (existingRelValues.includes(val)) {
          throw new Error(`EARS collision: relation kind "${val}" — pack "${registration.id}" vs "${existingId}"`);
        }
      }
    }
  }

  if (registration.services) {
    for (const [existingId, existing] of registrations) {
      if (!existing.services) continue;
      for (const key of Object.keys(registration.services)) {
        if (key in existing.services) {
          throw new Error(`Service collision: key "${key}" — pack "${registration.id}" vs "${existingId}"`);
        }
      }
    }
  }

  const registeredSteps: string[] = [];
  const registeredArtifacts: string[] = [];
  const registeredBlocks: string[] = [];

  try {
    if (registration.steps) {
      for (const step of registration.steps) {
        stepRegistry.register(step);
        registeredSteps.push(step.type);
      }
    }

    if (registration.artifacts) {
      for (const art of registration.artifacts) {
        artifactRegistry.register(art);
        registeredArtifacts.push(art.type);
      }
    }

    if (registration.blocks) {
      for (const block of registration.blocks) {
        blockRegistry.register(block);
        registeredBlocks.push(block.type);
      }
    }
  } catch (err) {
    for (const type of registeredSteps) stepRegistry.unregister(type);
    for (const type of registeredArtifacts) artifactRegistry.unregister(type);
    for (const type of registeredBlocks) blockRegistry.unregister(type);
    throw err;
  }

  const systemDesignations = registration.systems.filter(s => s.designation).map(s => s.designation!);
  const featureDesignations = (registration.features ?? []).filter(f => f.designation).map(f => f.designation!);
  const allDesignations = [...new Set([...systemDesignations, ...featureDesignations])];
  if (allDesignations.length) {
    registerDesignations(allDesignations);
  }

  registrations.set(registration.id, registration);

  _entityTypeCache = null;
  _servicesCache = null;
}

export function unregisterPack(packId: string): void {
  const reg = registrations.get(packId);
  if (!reg) throw new Error(`Pack "${packId}" is not registered`);

  if (reg.steps) {
    for (const step of reg.steps) stepRegistry.unregister(step.type);
  }
  if (reg.artifacts) {
    for (const art of reg.artifacts) artifactRegistry.unregister(art.type);
  }
  if (reg.blocks) {
    for (const block of reg.blocks) blockRegistry.unregister(block.type);
  }

  const systemDesignations = reg.systems.filter(s => s.designation).map(s => s.designation!);
  const featureDesignations = (reg.features ?? []).filter(f => f.designation).map(f => f.designation!);
  const allDesignations = [...new Set([...systemDesignations, ...featureDesignations])];
  if (allDesignations.length) {
    unregisterDesignations(allDesignations);
  }

  registrations.delete(packId);
  _entityTypeCache = null;
  _servicesCache = null;
}

export function getRegisteredEntityTypes(): ReadonlySet<string> {
  if (!_entityTypeCache) {
    _entityTypeCache = new Set<string>(['Relation']);
    for (const reg of registrations.values()) {
      if (reg.ears) {
        for (const val of Object.values(reg.ears.entities)) {
          _entityTypeCache.add(val);
        }
      }
    }
  }
  return _entityTypeCache;
}

export function getRegisteredSystems(): Map<string, import('xstate').AnyStateMachine> {
  const systems = new Map<string, import('xstate').AnyStateMachine>();
  for (const [id, entry] of hostSystems) {
    systems.set(id, entry.machine);
  }
  for (const reg of registrations.values()) {
    for (const sys of reg.systems) {
      systems.set(sys.id, sys.machine);
    }
  }
  return systems;
}

export function buildRegisteredEventValidationMap(): Map<string, Set<string>> {
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

export function getRegisteredServices(): Record<string, unknown> {
  if (!_servicesCache) {
    _servicesCache = {};
    for (const reg of registrations.values()) {
      if (reg.services) {
        Object.assign(_servicesCache, reg.services);
      }
    }
  }
  return _servicesCache;
}

export function getRegisteredEARS(): PackEARS {
  const entities: Record<string, string> = {};
  const relKinds: Record<string, string> = {};
  for (const reg of registrations.values()) {
    if (reg.ears) {
      Object.assign(entities, reg.ears.entities);
      Object.assign(relKinds, reg.ears.relKinds);
    }
  }
  return { entities, relKinds };
}

export function getBootHooks(): PackBootHooks[] {
  const hooks: PackBootHooks[] = [];
  for (const reg of registrations.values()) {
    if (reg.boot) hooks.push(reg.boot);
  }
  return hooks;
}

export function getPackBootHooks(packId: string): PackBootHooks | null {
  return registrations.get(packId)?.boot ?? null;
}

export function runRegisteredBootSeeds(
  orchestrateSeed?: (manifest: PackSeedManifest) => void,
): void {
  for (const reg of registrations.values()) {
    if (reg.boot?.seedManifest && orchestrateSeed) {
      orchestrateSeed(reg.boot.seedManifest);
    } else {
      reg.boot?.seed?.();
    }
  }
}

export function getRegisteredEARSPolicy(): { excludedEntityTypes: string[]; secretEntityTypes: string[] } {
  const excluded: string[] = [];
  const secret: string[] = [];
  for (const reg of registrations.values()) {
    if (reg.ears?.partitionPolicy) {
      if (reg.ears.partitionPolicy.excludedEntityTypes)
        excluded.push(...reg.ears.partitionPolicy.excludedEntityTypes);
      if (reg.ears.partitionPolicy.secretEntityTypes)
        secret.push(...reg.ears.partitionPolicy.secretEntityTypes);
    }
  }
  return { excludedEntityTypes: excluded, secretEntityTypes: secret };
}

export function getRegisteredMigrations(): PackMigration[] {
  const migrations: PackMigration[] = [];
  for (const reg of registrations.values()) {
    if (reg.migrations) migrations.push(...reg.migrations);
  }
  return migrations;
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
  hasFeEntry: boolean;
  hostVersion?: string;
  description?: string;
  entities: Record<string, string>;
  relKinds: Record<string, string>;
  plugins: string[];
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
}

export function getPackContributions(packId: string): PackContributions | null {
  const reg = registrations.get(packId);
  if (!reg) return null;

  const bootHooks: string[] = [];
  if (reg.boot?.earlySystem) bootHooks.push('earlySystem');
  if (reg.boot?.onInit) bootHooks.push('onInit');
  if (reg.boot?.seedManifest) bootHooks.push('seedManifest');
  else if (reg.boot?.seed) bootHooks.push('seed');
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
}
