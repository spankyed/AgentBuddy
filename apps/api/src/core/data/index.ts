import { createLogger } from '@/core/utils/debug/logger';
import { loadSnapshot as loadSnapshotFile, listSnapshots, restoreSnapshot, listGitSnapshots, loadGitSnapshot } from '@/systems/database/snapshot';

const logger = createLogger('load-data');

/**
 * Load the latest snapshot if available
 * Checks runtime snapshots first, then falls back to Git snapshots
 */
export async function loadSnapshot(): Promise<void> {
  try {
    // First check for runtime snapshots
    const snapshots = await listSnapshots();
    if (snapshots.length > 0) {
      // Sort snapshots by timestamp (newest first)
      const sortedSnapshots = snapshots.sort((a, b) => b.localeCompare(a));
      const latestSnapshot = sortedSnapshots[0];
      
      logger.info(`Loading runtime snapshot: ${latestSnapshot}`);
      const snapshotData = await loadSnapshotFile(latestSnapshot);
      await restoreSnapshot(snapshotData);
      logger.info(`Snapshot loaded successfully. Restored ${snapshotData.metadata.entityCount} entities.`);
    } else {
      // Check for Git snapshots if no runtime snapshots exist
      const gitSnapshots = await listGitSnapshots();
      if (gitSnapshots.length > 0) {
        // Load the first available Git snapshot
        const gitSnapshot = gitSnapshots[0];  
        logger.info(`Loading Git snapshot: ${gitSnapshot}`);
        const snapshotData = await loadGitSnapshot(gitSnapshot);
        await restoreSnapshot(snapshotData);
        logger.info(`Git snapshot loaded successfully. Restored ${snapshotData.metadata.entityCount} entities.`);
      } else {
        logger.info('No snapshots found. Starting with empty database.');
      }
    }
  } catch (error) {
    logger.error('Failed to load snapshot:', { error });
  }
}