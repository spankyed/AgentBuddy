import type { Dbs } from './env';
import { EARS } from '@/core/types';
import { mergeAttr, putAttr } from '@/core/utils/ears/attribute-storage';
import { addToIndex } from '@/core/utils/ears/relation-index';

function dec(e: { t: string; v: any }): unknown {
  if (!e) return null;
  if (e.t === 'date' && typeof e.v === 'string') return new Date(e.v);
  return e.v;
}

export async function hydrateFromLmdb(dbs: Dbs) {
  const { entities, attrs, relations } = dbs;

  // 1) Attributes (keys are `${kind}\x1F${entityId}\x1F${idx}`)
  for (const { key, value } of attrs.getRange()) {
    const [kind, entityId, idxStr] = String(key).split('\x1F');
    const idx = Number(idxStr);
    const val = dec(value);
    mergeAttr(entityId as EARS.EntityId, kind as EARS.AttrKind, val, idx);
  }

  // 2) Relations
  for (const { key: relId, value: r } of relations.getRange()) {
    putAttr(
      String(relId) as EARS.EntityId,
      EARS.AttrKind.RelationDetails,
      {
        sourceEntity: r.src,
        targetEntity: r.tgt,
        relationType: r.kind,
        info: r.info ?? undefined,
      } satisfies EARS.RelationDetail
    );
    addToIndex(r.kind, r.src, r.tgt, String(relId) as EARS.EntityId);
  }

  // (Entities collection is optional to hydrate; your attr/rel inserts already register entities in memory.)
}