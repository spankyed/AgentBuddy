import { WebSocketServer } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { appRouter } from '@/core/router';
import { createContext } from '@/core/router/context';
import { logger } from '@/core/shared/debug/logger';
import { SERVER_CONFIG, WS_CONFIG } from '@/setup/config';
import { backendActor } from '@/setup/backend';
import { terminalService } from '@/systems/code/services/terminal';

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

  // Safety net: always kill terminal processes before the API process exits
  process.on('exit', () => {
    terminalService.killAll();
  });

  // Setup graceful shutdown
  process.on('SIGTERM', () => {
    // Stop XState actor system first (triggers exit actions like terminal cleanup)
    backendActor?.stop();
    handler.broadcastReconnectNotification();
    wss.close();
    // Exit explicitly so the 'exit' handler fires before Electron force-kills us
    process.exit(0);
  });

  // Detect parent process death (e.g. Electron crashed) and trigger graceful shutdown
  if (process.platform !== 'win32') {
    const originalPpid = process.ppid;
    const parentCheck = setInterval(() => {
      if (process.ppid !== originalPpid) {
        console.log('[API] Parent process died, shutting down');
        clearInterval(parentCheck);
        process.kill(process.pid, 'SIGTERM');
      }
    }, 2000);
    parentCheck.unref();
  }

  return { wss, handler, port };
}