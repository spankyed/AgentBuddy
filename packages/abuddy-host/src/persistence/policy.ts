import type { EARS } from '@abuddy/sdk/types';

export type Partition = 'primary' | 'volatileBackup';

export interface PartitionPolicy {
  /** Which partition should an entity live in? */
  routeEntity(entityId: string, entityType?: EARS.Entity): Partition;

  /** Which partition should a relation live in? */
  routeRelation(params: { srcType: EARS.Entity; tgtType: EARS.Entity }): Partition;

  /** Whether we hydrate a partition on startup (default: only primary). */
  hydrate: Set<Partition>;
}

const entTypeOf = (id: string) => (id.split('-')[0] ?? id) as EARS.Entity;

export function makePolicy(config: {
  excludedEntityTypes: Set<EARS.Entity>;
  hydratePartitions?: Set<Partition>;
}): PartitionPolicy {
  const excluded = config.excludedEntityTypes;
  const hydrate = config.hydratePartitions ?? new Set<Partition>(['primary']);

  return {
    routeEntity(entityId, entityType) {
      const t = entityType ?? entTypeOf(entityId);
      if (excluded.has(t)) return 'volatileBackup';
      return 'primary';
    },

    routeRelation({ srcType, tgtType }) {
      if (excluded.has(srcType) || excluded.has(tgtType)) {
        return 'volatileBackup';
      }
      return 'primary';
    },

    hydrate,
  };
}
