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

  // First, load all tombstoned entities into a Set for filtering
  const tombstoned = new Set<string>();
  for (const { key, value } of entities.getRange()) {
    if (value?.deletedAt) {
      tombstoned.add(String(key));
    }
  }

  // Log statistics
  if (tombstoned.size > 0) {
    console.log(`[LMDB] Filtering out ${tombstoned.size} tombstoned entities during hydration`);
  }

  // 1) Attributes (keys are `${kind}\x1F${entityId}\x1F${idx}`)
  for (const { key, value } of attrs.getRange()) {
    const [kind, entityId, idxStr] = String(key).split('\x1F');
    
    // Skip attributes for tombstoned entities
    if (tombstoned.has(entityId)) {
      continue;
    }
    
    const idx = Number(idxStr);
    const val = dec(value);
    mergeAttr(entityId as EARS.EntityId, kind as EARS.AttrKind, val, idx);
  }

  // 2) Relations
  for (const { key: relId, value: r } of relations.getRange()) {
    const relIdStr = String(relId);
    
    // Skip relations that have tombstoned source or target entities
    // (Relations themselves are deleted, not tombstoned)
    if (tombstoned.has(r.src) || tombstoned.has(r.tgt)) {
      continue;
    }
    
    putAttr(
      relIdStr as EARS.EntityId,
      EARS.AttrKind.RelationDetails,
      {
        sourceEntity: r.src,
        targetEntity: r.tgt,
        relationType: r.kind,
        info: r.info ?? undefined,
      } satisfies EARS.RelationDetail
    );
    addToIndex(r.kind, r.src, r.tgt, relIdStr as EARS.EntityId);
  }

  // (Entities collection is optional to hydrate; your attr/rel inserts already register entities in memory.)
}