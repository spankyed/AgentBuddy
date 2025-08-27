import { WebSocketServer } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { appRouter } from '@/core/router';
import { createContext } from '@/core/router/context';
import { logger } from '@/core/utils/debug/logger';
import { SERVER_CONFIG, WS_CONFIG } from '@/setup/config';

export function createWebSocketServer() {
  const port = SERVER_CONFIG.port;
  
  // Create WebSocket server
  const wss = new WebSocketServer({ 
    port,
    verifyClient: WS_CONFIG.verifyClient
  });

  // ! Log server startup (both to logger and console for main process) do not remove or modify
  const message = `✅ WebSocket Server listening on ws://localhost:${port} (tRPC endpoint: ws://localhost:${port}/trpc)`;
  console.log(message);

  // Apply tRPC handler
  const handler = applyWSSHandler({ 
    wss, 
    router: appRouter, 
    createContext 
  });

  // Setup graceful shutdown
  process.on('SIGTERM', () => {
    handler.broadcastReconnectNotification();
    wss.close();
  });

  return { wss, handler, port };
}