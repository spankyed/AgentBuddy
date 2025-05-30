/*─────────────────────────────────────────────────────────────
 * edge-store.ts – one-stop helpers for relation edges
 *─────────────────────────────────────────────────────────────*/
import { relationIndex } from "@/shared/ears/relation-index";
import {
  getAttr,
  addRelation,
  updateRelation,
  removeRelation,
} from "@/shared/ears/attribute-storage";
import { EARS } from "@/shared/ears/types";

/** collect relation‑IDs that satisfy all supplied fields */
const matchIds = (
  w: Partial<Pick<EARS.RelationDetail,
    "sourceEntity" | "relationType" | "targetEntity">>,
) => {
  const kinds = w.relationType ? [w.relationType] : Object.keys(relationIndex);
  const out   = new Set<EARS.EntityId>();

  for (const k of kinds) {
    const { bySource, byTarget } = relationIndex[k] ?? {};
    if (!bySource) continue;

    const scan = (
      idx: Record<string, EARS.EntityId[]>,
      key?: string,
    ) =>
      (key ? idx[key] ?? [] : Object.values(idx).flat()).forEach(id =>
        out.add(id),
      );

    scan(bySource, w.sourceEntity);
    scan(byTarget, w.targetEntity);
  }
  return [...out];
};

export const edgeStore = {
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
    addRelation(src, kind, tgt, info);
  },

  /** patch first edge that matches */
  patchOne: (
    w: Partial<EARS.RelationDetail>,
    u: { newSource?: EARS.EntityId; newTarget?: EARS.EntityId; newInfo?: unknown },
  ) => {
    const [relId] = matchIds(w);
    if (relId) updateRelation(relId, u.newSource, u.newTarget, u.newInfo);
  },
};