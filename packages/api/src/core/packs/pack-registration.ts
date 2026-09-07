/**
 * Pack Registration
 *
 * Mutable registry where packs declare what they contribute.
 * API core reads from this instead of importing from registries directly.
 */

import type { PackRegistration, PackBootHooks, PackEARS, PackMigration } from '@abuddy/sdk/framework';
import { registerDesignations } from '@abuddy/sdk/designations';
import { stepRegistry } from '@abuddy/sdk/steps';
import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { blockRegistry } from '@abuddy/sdk/blocks';

export type { PackRegistration, PackBootHooks, PackEARS, PackMigration };

const registrations = new Map<string, PackRegistration>();

let _entityTypeCache: Set<string> | null = null;
let _servicesCache: Record<string, unknown> | null = null;

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

  const designated = registration.systems.filter(s => s.designation);
  if (designated.length) {
    registerDesignations(designated.map(s => s.designation!));
  }

  registrations.set(registration.id, registration);

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
  for (const reg of registrations.values()) {
    for (const sys of reg.systems) {
      systems.set(sys.id, sys.machine);
    }
  }
  return systems;
}

export function buildRegisteredEventValidationMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const reg of registrations.values()) {
    for (const sys of reg.systems) {
      map.set(sys.id, sys.events);
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

export function runRegisteredBootSeeds(): void {
  for (const reg of registrations.values()) {
    reg.boot?.seed?.();
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
