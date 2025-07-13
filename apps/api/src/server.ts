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
import { loadData } from '@/core/mock-data';
import staticData from './core/static-data';

(function setupBackend() {
  loadData();

  loadData(staticData);
  
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
