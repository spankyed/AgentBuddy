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
// import { loadData, loadSnapshot } from '@/core/data';
// import staticData from './core/data/static';
import { loadSnapshot } from '@/core/data';

(async function setupBackend() {
  // loadData();
  // loadData(staticData);
  await loadSnapshot();
  
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

// Create WebSocket server without path - tRPC will handle the routing
const wss = new WebSocketServer({ 
  port,
  // Allow any origin in development/production
  verifyClient: () => {
    // Accept all connections
    return true;
  }
});

logger.info(`✅ WebSocket Server listening on ws://localhost:${port} (tRPC endpoint: ws://localhost:${port}/trpc)`);

const handler = applyWSSHandler({ wss, router: appRouter, createContext });

process.on('SIGTERM', () => {
  handler.broadcastReconnectNotification();
  wss.close();
});
