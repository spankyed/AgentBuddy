import type { EARS } from '../types/entities.ts';
import type { SeedRecord } from '../build/seeds/records.ts';

/** Where a record sits: its parent row (for tree children) and its position among its siblings */
export interface SeedHookContext {
  parentId?: EARS.EntityId;
  index: number;
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

class SeedHookRegistry {
  #hooks = new Map<string, { hooks: SeedHooks; packId: string }>();

  register(entity: string, hooks: SeedHooks, packId: string): void {
    const existing = this.#hooks.get(entity);
    if (existing && existing.packId !== packId) {
      throw new Error(`Seed hooks for "${entity}" are already registered by pack "${existing.packId}"`);
    }
    this.#hooks.set(entity, { hooks, packId });
  }

  unregisterAll(packId: string): void {
    for (const [entity, entry] of this.#hooks) {
      if (entry.packId === packId) this.#hooks.delete(entity);
    }
  }

  get(entity: string): SeedHooks | undefined {
    return this.#hooks.get(entity)?.hooks;
  }
}

/** @internal Host-only registration; seeders read it */
export const seedHookRegistry = new SeedHookRegistry();
