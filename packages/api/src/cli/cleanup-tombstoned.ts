import { envs } from '@/core/ears/attribute-storage';

export function cleanupTombstoned() {
  let totalDeleted = 0;

  for (const partition of ['primary', 'secrets', 'volatileBackup'] as const) {
    const env = envs[partition];
    const toDelete: string[] = [];

    // Find all tombstoned entities
    for (const { key, value } of env.entities.getRange()) {
      if (value?.deletedAt) {
        toDelete.push(String(key));
      }
    }

    if (toDelete.length === 0) {
      console.log(`[Cleanup] No tombstoned entities in ${partition}`);
      continue;
    }

    // Delete them and their attributes in a transaction
    env.entities.transactionSync(() => {
      for (const entityId of toDelete) {
        // Delete entity record
        env.entities.remove(entityId);

        // Delete all attributes for this entity
        // Attributes are stored with format: kind\x1FentityId\x1Findex
        for (const { key } of env.attrs.getRange()) {
          const keyStr = String(key);
          // Check if this attribute belongs to the entity
          if (keyStr.includes(`\x1F${entityId}\x1F`)) {
            env.attrs.remove(key);
          }
        }
      }
    });

    console.log(`[Cleanup] Deleted ${toDelete.length} tombstoned entities from ${partition}`);
    totalDeleted += toDelete.length;
  }

  return totalDeleted;
}