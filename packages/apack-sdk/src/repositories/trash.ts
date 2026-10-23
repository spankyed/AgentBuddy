// The trash, over the engine's: a trashed entity stays stored, with its edges, marked with when it was trashed
// (`trashedAt`), and queries reach it only through `query.withTrashed` and `query.trashed`. These read and move
// several entities at once and stamp `updatedAt`. What trashing an entity means beyond that (its children, emptying
// the trash) is its feature's.
import { boundEars as ears } from '../ears/index.ts';
import type { EARS } from '../types/entities.ts';

/** The mark a trashed entity carries */
export interface TrashFields {
  trashedAt?: number;
}

/** An entity as the trash lists it */
export type Trashed<T extends object = object> = T & TrashFields & { id: EARS.EntityId };

const inEngine = (id: EARS.EntityId) => ears().query.withTrashed.ids(id).exists();

/** The trash, for any entity type */
export const trash = {
  /** Moves entities to the trash, trashed at `at`; returns the ids it moved (not missing or already trashed ones) */
  move(ids: readonly EARS.EntityId[], at = Date.now()): EARS.EntityId[] {
    const moved = ids.filter((id) => inEngine(id) && !trash.isTrashed(id));
    for (const id of moved) ears().write(id).trash(at).set('updatedAt', at);
    return moved;
  },

  /** Takes entities out of the trash; returns the ids it restored (not missing or untrashed ones) */
  restore(ids: readonly EARS.EntityId[]): EARS.EntityId[] {
    const restored = ids.filter((id) => trash.isTrashed(id));
    for (const id of restored) ears().write(id).restore().set('updatedAt', Date.now());
    return restored;
  },

  /** Whether an entity is in the trash */
  isTrashed: (id: EARS.EntityId): boolean => ears().getAttr(id, 'trashedAt' as EARS.AttrKind) !== null,

  /** The trashed entities of a type */
  list<T extends object = object>(entityType: string): Trashed<T>[] {
    return ears().query.trashed(entityType as never).pickAll() as Trashed<T>[];
  },

  /** The entities of a type trashed more than `maxAgeMs` before `now` */
  olderThan<T extends object = object>(entityType: string, maxAgeMs: number, now = Date.now()): Trashed<T>[] {
    return trash.list<T>(entityType).filter((entity) => (entity.trashedAt ?? now) < now - maxAgeMs);
  },
};
