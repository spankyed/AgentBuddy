import { EARS } from '@/core/types';
import { PersistenceSink } from './base-sink';
import { PartitionPolicy, Partition } from './policy';
import { getAttr } from '@/core/ears/attribute-storage';

const entTypeOf = (id: string): EARS.Entity => {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('[Sharded] Invalid entity id for routing');
  }
  const dash = id.indexOf('-');
  return (dash === -1 ? id : id.slice(0, dash)) as EARS.Entity;
};

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
      
      // Clean up relation caches for any relations involving this entity
      const relationsToRemove: string[] = [];
      for (const [rid, meta] of relMeta.entries()) {
        if (meta.src === entityId || meta.tgt === entityId) {
          relationsToRemove.push(rid);
        }
      }
      
      // Remove these relations from their partitions and clean caches
      for (const rid of relationsToRemove) {
        const part = relationPartitions.get(rid) ?? computePartitionFor(rid);
        if (part) {
          sinks[part].onRemoveRelation(rid);
        } else {
          // Unknown; remove from all sinks to be safe
          for (const sink of Object.values(sinks)) {
            sink.onRemoveRelation(rid);
          }
        }
        relationPartitions.delete(rid);
        relMeta.delete(rid);
      }
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
      // Enforce entireArray requirement for consistency
      if (!entireArray) {
        throw new Error('[Sharded] onDropAttr requires entireArray parameter to avoid index drift');
      }
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
        // Best effort: try all partitions
        for (const sink of Object.values(sinks)) {
          sink.onUpdateRelation(relId, patch);
        }
        return;
      }
      
      // Get previous info if available (for preserving during moves)
      const prevDetails = getAttr(relId as EARS.EntityId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail | null;
      const prevInfo = prevDetails?.info;
      
      // Build next metadata - use presence checks with validation
      const next = { ...prev };
      if ('src' in patch) {
        if (patch.src == null || patch.src === '') throw new Error('[Sharded] patch.src is empty');
        next.src = patch.src as string;
      }
      if ('tgt' in patch) {
        if (patch.tgt == null || patch.tgt === '') throw new Error('[Sharded] patch.tgt is empty');
        next.tgt = patch.tgt as string;
      }
      
      // Compute current and new partitions
      const curP = computePartitionFor(relId, prev);
      const newP = computePartitionFor(relId, next);
      
      if (!curP || !newP) {
        console.error('[Sharded] Failed to compute partition for relation:', relId);
        return;
      }
      
      if (curP !== newP) {
        // Relation needs to move partitions - preserve info if not in patch
        sinks[curP].onRemoveRelation(relId);
        sinks[newP].onAddRelation(
          relId, 
          next.kind, 
          next.src, 
          next.tgt, 
          'info' in patch ? patch.info : prevInfo  // Preserve info when moving
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
        // Unknown partition - remove from all
        for (const sink of Object.values(sinks)) {
          sink.onRemoveRelation(relId);
        }
        relMeta.delete(relId);
      }
    },

    close() {
      // Close all sinks, not just hardcoded ones
      for (const sink of Object.values(sinks)) {
        sink.close?.();
      }
    },

    getErrorStats() {
      let errorCount = 0;
      let lastError: any = null;
      
      // Aggregate stats from all sinks
      for (const sink of Object.values(sinks)) {
        const stats = sink.getErrorStats?.();
        if (stats) {
          errorCount += stats.errorCount ?? 0;
          lastError = lastError ?? stats.lastError;
        }
      }
      
      return { errorCount, lastError };
    },

    // Utility function for hydration to seed the caches
    seedRelationMetadata(relId: string, kind: string, src: string, tgt: string) {
      // Validate inputs to prevent entTypeOf from throwing
      if (!src || typeof src !== 'string' || src.length === 0) {
        console.warn(`[Sharded] Invalid src in seedRelationMetadata: relId=${relId}, src=${src}`);
        return;
      }
      if (!tgt || typeof tgt !== 'string' || tgt.length === 0) {
        console.warn(`[Sharded] Invalid tgt in seedRelationMetadata: relId=${relId}, tgt=${tgt}`);
        return;
      }
      
      relMeta.set(relId, { kind, src, tgt });
      relationPartitions.set(
        relId,
        policy.routeRelation({ 
          srcType: entTypeOf(src), 
          tgtType: entTypeOf(tgt) 
        })
      );
    },

    // Expose read-only copy for testing/debugging
    getRelMeta() {
      // Return a read-only copy to prevent external mutations
      return new Map(relMeta);
    }
  };
}