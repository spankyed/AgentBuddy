import { EARS } from '@/core/types';
import { PartitionPolicy, Partition } from './policy';
import { LmdbDbs } from '../lmdb/envs';
import { mergeAttr, putAttr } from '@/core/utils/ears/attribute-storage';
import { addToIndex } from '@/core/utils/ears/relation-index';
import type { makeShardedPersistence } from './sharded-router';

function dec(e: { t: string; v: any }): unknown {
  if (!e) return null;
  if (e.t === 'date' && typeof e.v === 'string') return new Date(e.v);
  return e.v;
}

export async function hydrateSharded(params: {
  envs: Record<Partition, LmdbDbs>;
  policy: PartitionPolicy;
  includeVolatile?: boolean;  // default false - whether to hydrate volatile backup
  shardedPersistence?: ReturnType<typeof makeShardedPersistence>;  // optional: seed metadata caches
}) {
  const { envs, policy, includeVolatile = false, shardedPersistence } = params;
  
  // Determine which partitions to hydrate based on policy and override flag
  const partitionsToHydrate: Partition[] = [];
  if (policy.hydrate.has('primary')) {
    partitionsToHydrate.push('primary');
  }
  if (includeVolatile || policy.hydrate.has('volatileBackup')) {
    partitionsToHydrate.push('volatileBackup');
  }

  console.log('[LMDB] Hydrating partitions:', partitionsToHydrate);

  for (const partition of partitionsToHydrate) {
    const env = envs[partition];
    
    // First, load all tombstoned entities for this partition
    const tombstoned = new Set<string>();
    for (const { key, value } of env.entities.getRange()) {
      if (value?.deletedAt) {
        tombstoned.add(String(key));
      }
    }

    if (tombstoned.size > 0) {
      console.log(`[LMDB] Filtering ${tombstoned.size} tombstoned entities in ${partition} partition`);
    }

    // Hydrate attributes
    let attrCount = 0;
    for (const { key, value } of env.attrs.getRange()) {
      const [kind, entityId, idxStr] = String(key).split('\x1F');
      
      // Skip attributes for tombstoned entities
      if (tombstoned.has(entityId)) {
        continue;
      }
      
      const idx = Number(idxStr);
      const val = dec(value);
      mergeAttr(entityId as EARS.EntityId, kind as EARS.AttrKind, val, idx);
      attrCount++;
    }

    // Hydrate relations
    let relCount = 0;
    for (const { key: relId, value: r } of env.relations.getRange()) {
      const relIdStr = String(relId);
      
      // Skip relations that involve tombstoned entities
      // (Relations themselves are deleted, not tombstoned)
      if (tombstoned.has(r.src) || tombstoned.has(r.tgt)) {
        continue;
      }
      
      // Seed relation metadata cache if shardedPersistence is provided
      if (shardedPersistence) {
        shardedPersistence.seedRelationMetadata(relIdStr, r.kind, r.src, r.tgt);
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
      relCount++;
    }

    console.log(`[LMDB] Hydrated ${partition}: ${attrCount} attributes, ${relCount} relations`);
  }
}