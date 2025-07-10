import 'dotenv/config'

import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { logErrors } from '@/shared/utils/actor-helpers';
import { appRouter } from '@/router';
import { createContext } from '@/router/context';
import { logger } from '@/shared/debug/logger';
import { createActor } from 'xstate';
import { logsSystem } from './systems/logs/system';
import { backendSystem, bus } from './systems/_backend/backend';
import { initializeLogCapture } from './shared/debug/log-capture';
import { loadMockData } from '@/systems/_backend/load-initial-data';

loadMockData();

initializeLogCapture();

const logsActor = createActor(logsSystem).start();

logsActor.subscribe(logErrors('Logs'));

// import { createSkyInspector } from '@statelyai/inspect';

// const sky = createSkyInspector();
export const backendActor = createActor(backendSystem, {
  // inspect: sky.inspect,
  systemId: bus,
}).start();

backendActor.subscribe(logErrors('Backend'));

const port = 3001;

const wss = new WebSocketServer({ port, path: '/trpc' });

logger.info(`✅ WebSocket Server listening on ws://localhost:${port}`);

const handler = applyWSSHandler({ wss, router: appRouter, createContext });

process.on('SIGTERM', () => {
  handler.broadcastReconnectNotification();
  wss.close();
});
