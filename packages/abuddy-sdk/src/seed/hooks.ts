import type { EARS } from '../types/entities.ts';
import type { SeedRecord } from '../build/seeds/records.ts';

/** Where a record sits: its parent row (for tree children) and its position among its siblings */
export interface SeedHookContext {
  parentId?: EARS.EntityId;
  index: number;
  /**
   * On update, the fields the row's previous seed set that the record no longer sets: `update` resets
   * them (to what `create` gives a record that doesn't set them). Empty for `find` and `create`.
   */
  clearedFields: string[];
}

/** An existing row a record matches */
export interface SeedHookMatch {
  id: EARS.EntityId;
  sourceHash?: unknown;
}

/**
 * How rows of one entity type are found, created, updated and removed when seeded. The pack that
 * owns the entity type registers them (abuddy.json `seedHooks`), so any pack seeding that type goes
 * through its repository. Without hooks, the generic seeder writes rows directly.
 */
export interface SeedHooks<R extends SeedRecord = SeedRecord> {
  /** Replaces the entry's `identity` matching */
  find?(record: R, context: SeedHookContext): SeedHookMatch | undefined;
  create?(record: R, context: SeedHookContext): EARS.EntityId;
  update?(id: EARS.EntityId, record: R, context: SeedHookContext): void;
  remove?(id: EARS.EntityId): void;
}

/** The seed hooks registered per entity type, and the pack that registered each */
export interface SeedHookRegistry {
  register(entity: string, hooks: SeedHooks, packId: string): void;
  unregisterAll(packId: string): void;
  get(entity: string): SeedHooks | undefined;
}

const registered = new Map<string, { hooks: SeedHooks; packId: string }>();

/** @internal Host-only registration; seeders read it */
export const seedHookRegistry: SeedHookRegistry = {
  register(entity, hooks, packId) {
    const existing = registered.get(entity);
    if (existing && existing.packId !== packId) {
      throw new Error(`Seed hooks for "${entity}" are already registered by pack "${existing.packId}"`);
    }
    registered.set(entity, { hooks, packId });
  },

  unregisterAll(packId) {
    for (const [entity, entry] of registered) {
      if (entry.packId === packId) registered.delete(entity);
    }
  },

  get(entity) {
    return registered.get(entity)?.hooks;
  },
};
