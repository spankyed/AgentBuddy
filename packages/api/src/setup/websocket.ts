import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { appRouter } from '@/core/router';
import { createContext } from '@/core/router/context';
import { createLogger } from '@abuddy/sdk/logger';
import { SERVER_CONFIG, apiToken, apiTokenIsOwn, isApiToken } from '@/setup/config';
import { appPacks, backendActor } from '@/setup/backend';
import { reloadBuiltInPack, reloadExternalPack } from '@abuddy/host/packs/runtime';
import { API_TOKEN_HEADER, resolveAppContext } from '@abuddy/sdk/env';

const logger = createLogger('backend');
const reloadingPacks = new Set<string>();

/** The only interface the server listens on: the app's own processes and local tools reach it, nothing on the network does */
export const API_HOST = '127.0.0.1';

/** Whether a WebSocket connection may open: its URL carries the API token (`?token=`), as the app's windows send it */
export function acceptsConnection(url: string | undefined, token = apiToken()): boolean {
  return isApiToken(new URL(url ?? '/', 'http://127.0.0.1').searchParams.get('token'), token);
}

/**
 * Why a pack reload request is refused, or null to take it. Only a development or test app reloads packs, and only
 * for a caller with the API token: `abuddy dev` and the built-in pack's watcher read it from the development app's
 * token file, the E2E tests from the app's window. A web page has no way to learn it.
 */
export function devReloadRefusal(headers: http.IncomingHttpHeaders, env = resolveAppContext().env, token = apiToken()): string | null {
  if (env !== 'development' && env !== 'test') return `pack reloads are for development builds (this one is ${env})`;
  const given = headers[API_TOKEN_HEADER];
  if (!isApiToken(Array.isArray(given) ? given[0] : given, token)) return 'the API token is missing or wrong';
  return null;
}

function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === 'POST' && req.url === '/dev/reload') {
    const refusal = devReloadRefusal(req.headers);
    if (refusal) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: refusal }));
      return;
    }
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
        if (reloadingPacks.has(packId)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'reload already in progress' }));
          return;
        }
        reloadingPacks.add(packId);
        try {
          if (builtIn) {
            await reloadBuiltInPack(appPacks, packId, backendActor);
          } else {
            await reloadExternalPack(appPacks, packId, backendActor);
          }
        } finally {
          reloadingPacks.delete(packId);
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
  const token = apiToken();

  const httpServer = http.createServer(handleHttpRequest);

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: ({ req }: { req: http.IncomingMessage }) => acceptsConnection(req.url, token),
  });

  httpServer.listen(port, API_HOST, () => {
    // ! Log server startup (both to logger and console for main process) do not remove or modify
    const message = `✅ WebSocket Server listening on ws://localhost:${port} (tRPC endpoint: ws://localhost:${port}/trpc)`;
    console.log(message);

    // Local tools (`abuddy dev`, the built-in pack's watcher) find a development app's API through these files, and
    // an API started by hand tells its clients its own token the same way. The token's is readable only by the user.
    if (process.env.NODE_ENV === 'development' || apiTokenIsOwn()) {
      const { apiPortFile, apiTokenFile } = resolveAppContext();
      try {
        fs.mkdirSync(path.dirname(apiPortFile), { recursive: true });
        fs.writeFileSync(apiPortFile, String(port));
        fs.writeFileSync(apiTokenFile, token, { mode: 0o600 });
        fs.chmodSync(apiTokenFile, 0o600);
        if (apiTokenIsOwn()) logger.info(`No ABUDDY_API_TOKEN given: clients send the token in ${apiTokenFile}`);
      } catch {}
    }
  });

  // Apply tRPC handler
  const handler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext
  });

  // Safety net: always kill terminal processes before the API process exits
  process.on('exit', () => {
    appPacks?.runShutdownHooks();
    const { apiPortFile, apiTokenFile } = resolveAppContext();
    for (const file of [apiPortFile, apiTokenFile]) {
      try { fs.unlinkSync(file); } catch {}
    }
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
