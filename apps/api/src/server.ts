import 'dotenv/config'

import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { logErrors } from '@/core/utils/actor-helpers';
import { appRouter } from '@/core/router';
import { createContext } from '@/core/router/context';
import { logger } from '@/core/utils/debug/logger';
import { createActor } from 'xstate';
import { logsSystem } from './systems/logs/system';
import { backendSystem, bus } from './systems/backend';
import { initializeLogCapture } from './core/utils/debug/log-capture';
import { loadData } from '@/core/data';
import staticData from './core/data/static';
import { loadSnapshot, listSnapshots, restoreSnapshot } from './systems/database/snapshot';

(async function setupBackend() {
  loadData();

  loadData(staticData);
  
  // Load the latest snapshot if available
  try {
    const snapshots = await listSnapshots();
    if (snapshots.length > 0) {
      // Sort snapshots by timestamp (newest first)
      const sortedSnapshots = snapshots.sort((a, b) => b.localeCompare(a));
      const latestSnapshot = sortedSnapshots[0];
      
      logger.info(`Loading snapshot: ${latestSnapshot}`);
      const snapshotData = await loadSnapshot(latestSnapshot);
      await restoreSnapshot(snapshotData);
      logger.info(`Snapshot loaded successfully. Restored ${snapshotData.metadata.entityCount} entities.`);
    } else {
      logger.info('No snapshots found. Starting with empty database.');
    }
  } catch (error) {
    logger.error('Failed to load snapshot:', { error });
  }
  
  initializeLogCapture();
  
  const logsActor = createActor(logsSystem).start();
  
  logsActor.subscribe(logErrors('Logs'));
  
  // import { createSkyInspector } from '@statelyai/inspect';
  
  // const sky = createSkyInspector();
  const backendActor = createActor(backendSystem, {
    // inspect: sky.inspect,
    systemId: bus,
  }).start();
  
  backendActor.subscribe(logErrors('Backend'));
})();

const port = 3001;

const wss = new WebSocketServer({ port, path: '/trpc' });

logger.info(`✅ WebSocket Server listening on ws://localhost:${port}`);

const handler = applyWSSHandler({ wss, router: appRouter, createContext });

process.on('SIGTERM', () => {
  handler.broadcastReconnectNotification();
  wss.close();
});
