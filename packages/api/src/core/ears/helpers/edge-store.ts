/*─────────────────────────────────────────────────────────────
 * edge-store.ts – one-stop helpers for relation edges
 *─────────────────────────────────────────────────────────────*/
import {
  getAttr,
  addRelation,
  updateRelation,
  removeRelation,
} from "@/core/ears/attribute-storage";
import { lmdbRelationIdsFor, lmdbRelationIdsForAll, lmdbHasRelation } from "@/core/ears/lmdb-reads";
import { EARS } from "@/core/types";

/** collect relation‑IDs that satisfy all supplied fields */
const matchIds = (
  w: Partial<Pick<EARS.RelationDetail,
    "sourceEntity" | "relationType" | "targetEntity">>,
): EARS.EntityId[] => {
  const out = new Set<EARS.EntityId>();

  if (w.sourceEntity && w.targetEntity && w.relationType) {
    const relId = lmdbHasRelation(w.sourceEntity, w.relationType, w.targetEntity);
    if (relId) out.add(relId);
  } else if (w.sourceEntity && w.relationType) {
    lmdbRelationIdsFor(w.sourceEntity, w.relationType, 'out').forEach(id => out.add(id));
  } else if (w.targetEntity && w.relationType) {
    lmdbRelationIdsFor(w.targetEntity, w.relationType, 'in').forEach(id => out.add(id));
  } else if (w.sourceEntity) {
    (lmdbRelationIdsForAll(w.sourceEntity) as EARS.EntityId[]).forEach(relId => {
      const d = getAttr(relId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail;
      if (d?.sourceEntity === w.sourceEntity) out.add(relId);
    });
  } else if (w.targetEntity) {
    (lmdbRelationIdsForAll(w.targetEntity) as EARS.EntityId[]).forEach(relId => {
      const d = getAttr(relId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail;
      if (d?.targetEntity === w.targetEntity) out.add(relId);
    });
  }
  return [...out];
};

export const edgeStore = {
  relIds: (w: Parameters<typeof matchIds>[0]) =>
    matchIds(w),

  /** full RelationDetail objects */
  find: (w: Partial<EARS.RelationDetail>) =>
    matchIds(w).map(
      id => getAttr(id, EARS.AttrKind.RelationDetails) as EARS.RelationDetail,
    ),

  /** delete *all* that match */
  unlink: (w: Partial<EARS.RelationDetail>) =>
    matchIds(w).forEach(removeRelation),

  /** idempotent create/replace exactly one edge */
  linkOne: (
    src: EARS.EntityId,
    kind: EARS.RelKind,
    tgt: EARS.EntityId,
    info?: unknown,
  ) => {
    edgeStore.unlink({
      sourceEntity: src,
      relationType: kind,
      targetEntity: tgt,
    });
    return addRelation(src, kind, tgt, info);
  },

  /** patch first edge that matches */
  patchOne: (
    w: Partial<EARS.RelationDetail>,
    u: { newSource?: EARS.EntityId; newTarget?: EARS.EntityId; newInfo?: unknown },
  ) => {
    const [relId] = matchIds(w);
    if (relId) {
      updateRelation(relId, u.newSource, u.newTarget, u.newInfo);
      return true;
    }
    return false;
  },
};
