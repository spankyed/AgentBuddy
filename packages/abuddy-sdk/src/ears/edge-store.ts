import { relationIndex } from './relation-index.ts';
import {
  getAttr,
  addRelation,
  updateRelation,
  removeRelationById,
} from './attribute-storage.ts';
import { EARS } from '../types/entities.ts';

const matchIds = (
  w: Partial<Pick<EARS.RelationDetail,
    "sourceEntity" | "relationType" | "targetEntity">>,
): EARS.EntityId[] => {
  const kinds = w.relationType ? [w.relationType] : Object.keys(relationIndex);
  const out   = new Set<EARS.EntityId>();

  for (const k of kinds) {
    const { bySource, byTarget } = relationIndex[k] ?? {};
    if (!bySource) continue;

    if (w.sourceEntity !== undefined && w.targetEntity !== undefined) {
      const fromSource = new Set(bySource[w.sourceEntity] ?? []);
      const fromTarget = new Set(byTarget[w.targetEntity] ?? []);
      fromSource.forEach(id => {
        if (fromTarget.has(id)) out.add(id);
      });
    }
    else if (w.sourceEntity !== undefined) {
      (bySource[w.sourceEntity] ?? []).forEach(id => out.add(id));
    }
    else if (w.targetEntity !== undefined) {
      (byTarget[w.targetEntity] ?? []).forEach(id => out.add(id));
    }
    else {
      for (const ids of Object.values(bySource)) {
        for (const id of ids) {
          out.add(id);
        }
      }
    }
  }
  return [...out];
};

export const edgeStore = {
  relIds: (w: Parameters<typeof matchIds>[0]) =>
    matchIds(w),

  find: (w: Partial<EARS.RelationDetail>) =>
    matchIds(w).map(
      id => getAttr(id, EARS.AttrKind.RelationDetails) as EARS.RelationDetail,
    ),

  unlink: (w: Partial<EARS.RelationDetail>) =>
    matchIds(w).forEach(removeRelationById),

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
