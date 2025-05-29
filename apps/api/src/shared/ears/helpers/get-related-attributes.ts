import type { EARS } from "@/types";
import { getAttribute, queryEntitiesByRelationTo } from "../attribute-storage";
import type { Simplify } from "@/shared/utils/event-helpers";

// map object-keys to AttrKinds
type AttrMap<T> = { [K in keyof T]: EARS.AttrKind };

/**
 * Fetches all entities of a given type related to `sourceId` by `relKind`,
 * and returns an array of `{ id, ...attrs }` objects.
 */
export function getRelatedEntities<T>(
  sourceId: EARS.EntityId,
  relKind: EARS.RelKind,
  targetType: EARS.Entity,
  attrs: AttrMap<T>
): Array<Simplify<{ id: string } & T>> {
  // 1) find all related IDs
  const relatedIds = queryEntitiesByRelationTo(relKind, sourceId, true);

  // 2) filter down to only those matching our entity prefix
  const prefix = `${targetType}-`;
  const filtered = relatedIds.filter(id => id.startsWith(prefix));

  // 3) map each ID to an object with its attributes
  return filtered.map(id => {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const obj: any = { id };
    for (const key of Object.keys(attrs)) {
      obj[key] = getAttribute(id, attrs[key as keyof T]);
    }
    return obj as { id: string } & T;
  });
}
