import type { EARS } from '../types/entities.ts';
import type { SeedRecord } from '../build/seeds/records.ts';
import { boundHost } from '../runtime/host-runtime.ts';

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
 * owns the entity type declares them (abuddy.json `seedHooks`), so any pack seeding that type goes
 * through its repository. Without hooks, the generic seeder writes rows directly.
 */
export interface SeedHooks<R extends SeedRecord = SeedRecord> {
  /**
   * The entity holds other records rather than being one of them (a folder), so a row another pack
   * seeded is reused as a parent: the record's children are seeded under it and the row itself is
   * left as its own pack seeded it. Without this a row another pack's seed claimed is never matched,
   * and the record seeds a second row beside it.
   */
  container?: boolean;
  /** Replaces the entry's `identity` matching */
  find?(record: R, context: SeedHookContext): SeedHookMatch | undefined;
  create?(record: R, context: SeedHookContext): EARS.EntityId;
  update?(id: EARS.EntityId, record: R, context: SeedHookContext): void;
  remove?(id: EARS.EntityId): void;
}

/** The seed hooks the registered packs declare, by entity type */
export interface SeedHookRegistry {
  get(entity: string): SeedHooks | undefined;
}

/** @internal Seeders read the hooks of the bound app's registered packs (a pack's registration's `seedHooks`) */
export const seedHookRegistry: SeedHookRegistry = {
  get: (entity) => boundHost().packs.seedHooks(entity),
};
