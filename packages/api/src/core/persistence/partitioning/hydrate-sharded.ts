import { EARS } from '@abuddy/sdk';
import type { PartitionPolicy, Partition } from '@abuddy/sdk/persistence';
import type { makeShardedPersistence } from '@abuddy/sdk/persistence';
import { LmdbDbs } from '../lmdb/envs';
import { bulkLoadAttr, addToIndex } from '@abuddy/sdk/ears/internals';

const SEP = '\x1F';

function dec(e: { t: string; v: any }): unknown {
  if (!e) return null;
  if (e.t === 'date' && typeof e.v === 'string') return new Date(e.v);
  return e.v;
}

export async function hydrateSharded(params: {
  envs: Record<Partition, LmdbDbs>;
  policy: PartitionPolicy;
  includeVolatile?: boolean;
  skipTombstoneScan?: boolean;
  shardedPersistence?: ReturnType<typeof makeShardedPersistence>;
}) {
  const { envs, policy, includeVolatile = false, skipTombstoneScan = false, shardedPersistence } = params;

  const partitionsToHydrate: Partition[] = [];
  if (policy.hydrate.has('primary')) {
    partitionsToHydrate.push('primary');
  }
  if (policy.hydrate.has('secrets')) {
    partitionsToHydrate.push('secrets');
  }
  if (includeVolatile || policy.hydrate.has('volatileBackup')) {
    partitionsToHydrate.push('volatileBackup');
  }

  console.log('[LMDB] Hydrating partitions:', partitionsToHydrate);

  for (const partition of partitionsToHydrate) {
    const env = envs[partition];

    let tombstoned: Set<string> | null = null;
    if (!skipTombstoneScan) {
      tombstoned = new Set<string>();
      for (const { key, value } of env.entities.getRange()) {
        if (value?.deletedAt) {
          tombstoned.add(String(key));
        }
      }
      if (tombstoned.size > 0) {
        console.log(`[LMDB] Filtering ${tombstoned.size} tombstoned entities in ${partition} partition`);
      }
    }

    // Hydrate attributes
    let attrCount = 0;
    for (const { key, value } of env.attrs.getRange()) {
      const keyStr = String(key);
      const sep1 = keyStr.indexOf(SEP);
      const sep2 = keyStr.indexOf(SEP, sep1 + 1);
      const kind = keyStr.substring(0, sep1);
      const entityId = keyStr.substring(sep1 + 1, sep2);

      if (tombstoned?.has(entityId)) continue;

      const idx = Number(keyStr.substring(sep2 + 1));
      bulkLoadAttr(entityId as EARS.EntityId, kind as EARS.AttrKind, dec(value), idx);
      attrCount++;
    }

    // Hydrate relations
    let relCount = 0;
    for (const { key: relId, value: r } of env.relations.getRange()) {
      const relIdStr = String(relId);

      if (tombstoned && (tombstoned.has(r.src) || tombstoned.has(r.tgt))) continue;

      if (!r.src || typeof r.src !== 'string' || r.src.length === 0) {
        console.warn(`[Hydrate] Skipping relation with invalid src: relId=${relIdStr}, src=${r.src}`);
        continue;
      }
      if (!r.tgt || typeof r.tgt !== 'string' || r.tgt.length === 0) {
        console.warn(`[Hydrate] Skipping relation with invalid tgt: relId=${relIdStr}, tgt=${r.tgt}`);
        continue;
      }
      if (!r.kind || typeof r.kind !== 'string') {
        console.warn(`[Hydrate] Skipping relation with invalid kind: relId=${relIdStr}, kind=${r.kind}`);
        continue;
      }

      if (shardedPersistence) {
        shardedPersistence.seedRelationMetadata(relIdStr, r.kind, r.src, r.tgt);
      }

      bulkLoadAttr(
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