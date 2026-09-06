/**
 * Pack Registration
 *
 * Mutable registry where packs declare what they contribute.
 * API core reads from this instead of importing from registries directly.
 */

import type { PackRegistration, PackBootHooks, PackEARS, PackMigration } from '@abuddy/sdk/framework';
import { stepRegistry } from '@abuddy/sdk/steps';
import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { blockRegistry } from '@abuddy/sdk/blocks';

export type { PackRegistration, PackBootHooks, PackEARS, PackMigration };

const registrations = new Map<string, PackRegistration>();

let _entityTypeCache: Set<string> | null = null;

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

  registrations.set(registration.id, registration);

  if (registration.steps) {
    for (const step of registration.steps) {
      stepRegistry.register(step);
    }
  }

  if (registration.artifacts) {
    for (const art of registration.artifacts) {
      artifactRegistry.register(art);
    }
  }

  if (registration.blocks) {
    for (const block of registration.blocks) {
      blockRegistry.register(block);
    }
  }

  _entityTypeCache = null;
}

export function getRegisteredEntityTypes(): Set<string> {
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

export function getRegisteredSystems(): Map<string, any> {
  const systems = new Map<string, any>();
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
  const services: Record<string, unknown> = {};
  for (const reg of registrations.values()) {
    if (reg.services) {
      Object.assign(services, reg.services);
    }
  }
  return services;
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
