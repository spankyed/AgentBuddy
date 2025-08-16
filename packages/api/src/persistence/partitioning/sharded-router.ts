import { EARS } from '@/core/types';
import { PersistenceSink } from './base-sink';
import { PartitionPolicy, Partition } from './policy';

const entTypeOf = (id: string) => (id.split('-')[0] ?? id) as EARS.Entity;

export function makeShardedPersistence(
  policy: PartitionPolicy,
  sinks: Record<Partition, PersistenceSink>
): PersistenceSink {
  
  const pickEntity = (entityId: string, entityType?: EARS.Entity) =>
    policy.routeEntity(entityId, entityType);
  
  const pickRel = (src: string, tgt: string) =>
    policy.routeRelation({ srcType: entTypeOf(src), tgtType: entTypeOf(tgt) });

  // Track relation locations for efficient updates
  const relationPartitions = new Map<string, Partition>();

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
      relationPartitions.set(relId, p);
      sinks[p].onAddRelation(relId, kind, src, tgt, info);
    },

    onUpdateRelation(relId: string, patch: { src?: string; tgt?: string; info?: unknown }) {
      // Get current partition or try to determine from new endpoints
      const currentPartition = relationPartitions.get(relId);
      
      if (patch.src || patch.tgt) {
        // Endpoints changed - might need to move partitions
        const newPartition = pickRel(patch.src ?? '', patch.tgt ?? '');
        
        if (currentPartition && currentPartition !== newPartition) {
          // Move relation to new partition
          // Remove from old partition
          sinks[currentPartition].onRemoveRelation(relId);
          
          // We need the full relation data to re-add it
          // In a real implementation, we'd need to fetch current data
          // For now, we'll update both partitions and let the one without it no-op
          sinks.primary.onUpdateRelation(relId, patch);
          sinks.volatileBackup.onUpdateRelation(relId, patch);
          
          relationPartitions.set(relId, newPartition);
        } else {
          // Same partition or unknown current partition
          const p = newPartition;
          sinks[p].onUpdateRelation(relId, patch);
          relationPartitions.set(relId, p);
        }
      } else {
        // Only info changed, no endpoint changes
        if (currentPartition) {
          sinks[currentPartition].onUpdateRelation(relId, patch);
        } else {
          // Unknown partition - update both and let the one without it no-op
          sinks.primary.onUpdateRelation(relId, patch);
          sinks.volatileBackup.onUpdateRelation(relId, patch);
        }
      }
    },

    onRemoveRelation(relId: string) {
      const p = relationPartitions.get(relId);
      if (p) {
        sinks[p].onRemoveRelation(relId);
        relationPartitions.delete(relId);
      } else {
        // Unknown partition - remove from both
        sinks.primary.onRemoveRelation(relId);
        sinks.volatileBackup.onRemoveRelation(relId);
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
    }
  };
}