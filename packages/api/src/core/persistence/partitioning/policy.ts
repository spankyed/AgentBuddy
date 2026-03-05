import { EARS } from '@/core/types';

export type Partition = 'primary' | 'volatileBackup' | 'secrets';

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
  excludedEntityTypes: Set<EARS.Entity>;          // e.g. new Set([EARS.Entity.TNode])
  secretEntityTypes?: Set<EARS.Entity>;           // e.g. new Set([EARS.Entity.Secret])
  hydratePartitions?: Set<Partition>;             // default: new Set(['primary', 'secrets'])
}): PartitionPolicy {
  const excluded = config.excludedEntityTypes;
  const secrets = config.secretEntityTypes ?? new Set([EARS.Entity.Secret]);
  const hydrate = config.hydratePartitions ?? new Set<Partition>(['primary', 'secrets']);

  return {
    routeEntity(entityId, entityType) {
      const t = entityType ?? entTypeOf(entityId);
      if (secrets.has(t)) return 'secrets';
      if (excluded.has(t)) return 'volatileBackup';
      return 'primary';
    },
    
    routeRelation({ srcType, tgtType }) {
      // If either side is a secret, put the relation in secrets partition
      if (secrets.has(srcType) || secrets.has(tgtType)) {
        return 'secrets';
      }
      // If either side is excluded, put the relation with the excluded set
      if (excluded.has(srcType) || excluded.has(tgtType)) {
        return 'volatileBackup';
      }
      return 'primary';
    },
    
    hydrate,
  };
}