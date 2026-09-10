import * as http from 'http';
import { WebSocketServer } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { appRouter } from '@/core/router';
import { createContext } from '@/core/router/context';
import { logger } from '@/core/shared/debug/logger';
import { SERVER_CONFIG, WS_CONFIG } from '@/setup/config';
import { backendActor } from '@/setup/backend';
import { runShutdownHooks } from '@abuddy/sdk/utils';

function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === 'POST' && req.url === '/dev/reload') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { packId, builtIn } = JSON.parse(body);
        if (!packId || typeof packId !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'packId required' }));
          return;
        }
        if (builtIn) {
          const { reloadBuiltInPack } = await import('@/packs/pack-reload');
          await reloadBuiltInPack(packId, backendActor);
        } else {
          const { reloadExternalPack } = await import('@/packs/pack-reload');
          await reloadExternalPack(packId, backendActor);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        logger.error('Pack reload failed:', err as Error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
}

export function createWebSocketServer() {
  const port = SERVER_CONFIG.port;

  const httpServer = http.createServer(handleHttpRequest);

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: WS_CONFIG.verifyClient
  });

  httpServer.listen(port, () => {
    // ! Log server startup (both to logger and console for main process) do not remove or modify
    const message = `✅ WebSocket Server listening on ws://localhost:${port} (tRPC endpoint: ws://localhost:${port}/trpc)`;
    console.log(message);
  });

  // Apply tRPC handler
  const handler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext
  });

  // Safety net: always kill terminal processes before the API process exits
  process.on('exit', () => {
    runShutdownHooks();
  });

  // Setup graceful shutdown
  process.on('SIGTERM', () => {
    // Stop XState actor system first (triggers exit actions like terminal cleanup)
    backendActor?.stop();
    handler.broadcastReconnectNotification();
    wss.close();
    httpServer.close();
    // Exit explicitly so the 'exit' handler fires before Electron force-kills us
    process.exit(0);
  });

  // Detect parent process death (e.g. Electron crashed) and trigger graceful shutdown
  if (process.platform !== 'win32') {
    const originalPpid = process.ppid;
    const parentCheck = setInterval(() => {
      let parentGone = process.ppid === 1 || process.ppid !== originalPpid;
      if (!parentGone) {
        try {
          process.kill(originalPpid, 0);
        } catch {
          parentGone = true;
        }
      }

      if (parentGone) {
        console.log('[API] Parent process died, shutting down');
        clearInterval(parentCheck);
        process.kill(process.pid, 'SIGTERM');
      }
    }, 2000);
    parentCheck.unref();
  }

  return { wss, handler, port };
}
