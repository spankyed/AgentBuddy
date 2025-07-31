import { createLogger } from '@/core/utils/debug/logger';
import { loadSnapshot as loadSnapshotFile, listSnapshots, restoreSnapshot } from '@/systems/database/snapshot';

const logger = createLogger('load-data');

/**
 * Load the latest snapshot if available
 */
export async function loadSnapshot(): Promise<void> {
  try {
    const snapshots = await listSnapshots();
    if (snapshots.length > 0) {
      // Sort snapshots by timestamp (newest first)
      const sortedSnapshots = snapshots.sort((a, b) => b.localeCompare(a));
      const latestSnapshot = sortedSnapshots[0];
      
      logger.info(`Loading snapshot: ${latestSnapshot}`);
      const snapshotData = await loadSnapshotFile(latestSnapshot);
      await restoreSnapshot(snapshotData);
      logger.info(`Snapshot loaded successfully. Restored ${snapshotData.metadata.entityCount} entities.`);
    } else {
      logger.info('No snapshots found. Starting with empty database.');
    }
  } catch (error) {
    logger.error('Failed to load snapshot:', { error });
  }
}