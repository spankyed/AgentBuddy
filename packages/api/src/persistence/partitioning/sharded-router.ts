import { EARS } from '@/core/types';
import { PersistenceSink } from './base-sink';
import { PartitionPolicy, Partition } from './policy';
import { getAttr } from '@/core/utils/ears/attribute-storage';

const entTypeOf = (id: string) => (id.split('-')[0] ?? id) as EARS.Entity;

// Relation metadata cache to track kind, src, tgt for proper routing
const relMeta = new Map<string, { kind: string; src: string; tgt: string }>();

// Fallback: read from in-memory store if cache is empty
function getRelationMeta(relId: string) {
  const d = getAttr(relId as EARS.EntityId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail | null;
  return d ? { 
    kind: d.relationType, 
    src: d.sourceEntity as string, 
    tgt: d.targetEntity as string 
  } : null;
}

export function makeShardedPersistence(
  policy: PartitionPolicy,
  sinks: Record<Partition, PersistenceSink>
): PersistenceSink & { 
  seedRelationMetadata(relId: string, kind: string, src: string, tgt: string): void;
  getRelMeta(): Map<string, { kind: string; src: string; tgt: string }>;
} {
  
  const pickEntity = (entityId: string, entityType?: EARS.Entity) =>
    policy.routeEntity(entityId, entityType);
  
  const pickRel = (src: string, tgt: string) =>
    policy.routeRelation({ srcType: entTypeOf(src), tgtType: entTypeOf(tgt) });

  // Track relation locations for efficient updates
  const relationPartitions = new Map<string, Partition>();

  // Helper to compute partition for a relation
  function computePartitionFor(
    relId: string,
    metaHint?: { kind: string; src: string; tgt: string }
  ): Partition | null {
    const meta = metaHint ?? relMeta.get(relId) ?? getRelationMeta(relId);
    if (!meta) return null;
    
    return policy.routeRelation({
      srcType: entTypeOf(meta.src),
      tgtType: entTypeOf(meta.tgt),
    });
  }

  return {
    onCreateEntity(entityId: string, entityType?: string) {
      const p = pickEntity(entityId, entityType as EARS.Entity);
      sinks[p].onCreateEntity(entityId, entityType);
    },

    onDestroyEntity(entityId: string) {
      // Destruction is semantic; delete from whichever partition it lives in
      const p = pickEntity(entityId);
      sinks[p].onDestroyEntity(entityId);
    },

    onPutAttr(kind: string, entityId: string, idx: number, value: unknown, entireArray?: unknown[]) {
      const p = pickEntity(entityId);
      sinks[p].onPutAttr(kind, entityId, idx, value, entireArray);
    },

    onPutAttrArray(kind: string, entityId: string, values: unknown[]) {
      const p = pickEntity(entityId);
      if (sinks[p].onPutAttrArray) {
        sinks[p].onPutAttrArray!(kind, entityId, values);
      } else {
        // Fallback: use onPutAttr with entire array
        sinks[p].onPutAttr(kind, entityId, 0, values[0], values);
      }
    },

    onDropAttr(kind: string, entityId: string, idx: number, entireArray?: unknown[]) {
      const p = pickEntity(entityId);
      sinks[p].onDropAttr(kind, entityId, idx, entireArray);
    },

    onAddRelation(relId: string, kind: string, src: string, tgt: string, info: unknown) {
      const p = pickRel(src, tgt);
      
      // Update caches
      relMeta.set(relId, { kind, src, tgt });
      relationPartitions.set(relId, p);
      
      sinks[p].onAddRelation(relId, kind, src, tgt, info);
    },

    onUpdateRelation(relId: string, patch: { src?: string; tgt?: string; info?: unknown }) {
      // Get current metadata
      const prev = relMeta.get(relId) ?? getRelationMeta(relId);
      
      if (!prev) {
        console.warn('[Sharded] onUpdateRelation called with unknown relId:', relId);
        // Best effort: try both partitions
        sinks.primary.onUpdateRelation(relId, patch);
        sinks.volatileBackup.onUpdateRelation(relId, patch);
        return;
      }
      
      // Build next metadata
      const next = {
        ...prev,
        ...('src' in patch && patch.src ? { src: patch.src } : {}),
        ...('tgt' in patch && patch.tgt ? { tgt: patch.tgt } : {}),
      };
      
      // Compute current and new partitions
      const curP = computePartitionFor(relId, prev);
      const newP = computePartitionFor(relId, next);
      
      if (!curP || !newP) {
        console.error('[Sharded] Failed to compute partition for relation:', relId);
        return;
      }
      
      if (curP !== newP) {
        // Relation needs to move partitions
        sinks[curP].onRemoveRelation(relId);
        sinks[newP].onAddRelation(
          relId, 
          next.kind, 
          next.src, 
          next.tgt, 
          'info' in patch ? patch.info : undefined
        );
        relationPartitions.set(relId, newP);
      } else {
        // Same partition, just update
        sinks[curP].onUpdateRelation(relId, patch);
      }
      
      // Update cache
      relMeta.set(relId, next);
    },

    onRemoveRelation(relId: string) {
      const p = relationPartitions.get(relId) ?? computePartitionFor(relId);
      
      if (p) {
        sinks[p].onRemoveRelation(relId);
        relationPartitions.delete(relId);
        relMeta.delete(relId);
      } else {
        // Unknown partition - remove from both
        sinks.primary.onRemoveRelation(relId);
        sinks.volatileBackup.onRemoveRelation(relId);
        relMeta.delete(relId);
      }
    },

    close() {
      sinks.primary.close?.();
      sinks.volatileBackup.close?.();
    },

    getErrorStats() {
      const primaryStats = sinks.primary.getErrorStats?.() ?? { errorCount: 0, lastError: null };
      const backupStats = sinks.volatileBackup.getErrorStats?.() ?? { errorCount: 0, lastError: null };
      
      return {
        errorCount: primaryStats.errorCount + backupStats.errorCount,
        lastError: primaryStats.lastError || backupStats.lastError,
      };
    },

    // Utility function for hydration to seed the caches
    seedRelationMetadata(relId: string, kind: string, src: string, tgt: string) {
      relMeta.set(relId, { kind, src, tgt });
      relationPartitions.set(
        relId,
        policy.routeRelation({ 
          srcType: entTypeOf(src), 
          tgtType: entTypeOf(tgt) 
        })
      );
    },

    // Expose for testing/debugging
    getRelMeta() {
      return relMeta;
    }
  };
}