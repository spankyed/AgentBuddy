// The trash: soft delete for any entity type. A trashed entity stays stored, marked `deleted: true` with the time
// it was trashed (`deletedAt`); the engine's finders (findById, findAll, findWhere, …) leave it out, and
// findByIdRaw still reads it. Restoring removes both marks. What trashing an entity means beyond that (its
// children, emptying the trash) is its feature's.
import { installedEngine as ears } from '@abuddy/ears';
import type { EARS } from '../types/entities.ts';

/** The marks a trashed entity carries */
export interface TrashFields {
  deleted?: boolean;
  deletedAt?: number;
}

/** An entity as the trash lists it */
export type Trashed<T extends object = object> = T & TrashFields & { id: EARS.EntityId };

const trashed = (entity: TrashFields | undefined): boolean => entity?.deleted === true;

/** Soft delete for any entity type: trashed entities stay stored, marked, and the finders leave them out */
export const trash = {
  /** Moves entities to the trash, trashed at `at`; returns the ids it moved (not missing or already trashed ones) */
  move(ids: readonly EARS.EntityId[], at = Date.now()): EARS.EntityId[] {
    const moved = ids.filter((id) => {
      const entity = ears().findByIdRaw<TrashFields>(id);
      return entity !== undefined && !trashed(entity);
    });
    for (const id of moved) ears().updateEntity(id, { deleted: true, deletedAt: at });
    return moved;
  },

  /** Takes entities out of the trash; returns the ids it restored (not missing or untrashed ones) */
  restore(ids: readonly EARS.EntityId[]): EARS.EntityId[] {
    const restored = ids.filter((id) => trashed(ears().findByIdRaw<TrashFields>(id)));
    for (const id of restored) ears().updateEntity(id, { deleted: null, deletedAt: null });
    return restored;
  },

  /** Whether an entity is in the trash */
  isTrashed: (id: EARS.EntityId): boolean => trashed(ears().findByIdRaw<TrashFields>(id)),

  /** The trashed entities of a type */
  list<T extends object = object>(entityType: string): Trashed<T>[] {
    return (ears().qx(entityType as EARS.Entity).pickAll() as Trashed<T>[]).filter(trashed);
  },

  /** The entities of a type trashed more than `maxAgeMs` before `now` */
  olderThan<T extends object = object>(entityType: string, maxAgeMs: number, now = Date.now()): Trashed<T>[] {
    return trash.list<T>(entityType).filter((entity) => (entity.deletedAt ?? now) < now - maxAgeMs);
  },
};
