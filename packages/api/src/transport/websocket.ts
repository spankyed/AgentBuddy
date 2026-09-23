import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { appRouter } from '@/transport';
import { createContext } from '@/transport/context';
import { createLogger } from '@abuddy/sdk/logger';
import { SERVER_CONFIG, apiToken, apiTokenIsOwn, isApiToken } from '@/boot/config';
import { appPacks, backendActor } from '@/runtime';
import { reloadBuiltInPack, reloadExternalPack } from '@abuddy/host/packs/runtime';
import { resolveAppContext } from '@abuddy/sdk/env';
import type { ApiEndpoint } from '@abuddy/host/process-liveness';
import { API_HOST, API_TOKEN_HEADER } from '@abuddy/sdk/utils/pure';

const logger = createLogger('backend');
const reloadingPacks = new Set<string>();

/**
 * The WebSocket subprotocol the app's windows speak, the one the server answers with. They send the API token as a
 * second subprotocol (`abuddy-token.<token>`), not in the URL: browsers print a socket's URL when it fails to connect,
 * and the app logs what the window prints. The renderer's API client (`packages/renderer/src/core/trpc.ts`) offers both.
 */
export const API_PROTOCOL = 'abuddy';
const TOKEN_PROTOCOL = 'abuddy-token.';

/** Whether a WebSocket connection may open: the subprotocols it offers (`Sec-WebSocket-Protocol`) carry the API token */
export function acceptsConnection(offeredProtocols: string | undefined, token = apiToken()): boolean {
  const given = (offeredProtocols ?? '').split(',').map((protocol) => protocol.trim())
    .find((protocol) => protocol.startsWith(TOKEN_PROTOCOL))?.slice(TOKEN_PROTOCOL.length);
  return isApiToken(given, token);
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

/**
 * Writes a file only this user can read: a new file created with those permissions, then moved over any file already
 * there, so neither an existing file's permissions nor a half-written one is ever what a reader finds.
 */
function writePrivateFile(file: string, content: string): void {
  const temp = `${file}.${process.pid}.tmp`;
  fs.rmSync(temp, { force: true });
  fs.writeFileSync(temp, content, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
}

/**
 * Tells local tools where this API is. Every run publishes its port, so a tool finds it and can tell that an app is
 * running on the data dir, whatever the platform (`abuddy db` refuses to change a database an app holds); the port
 * alone opens nothing, since a call needs the token. The token itself goes to a file only where a local tool may use
 * it: a development app (`abuddy dev`, the built-in pack's watcher), and an API started by hand, which made up its
 * own. That file is readable only by the user. Both are removed when the process exits.
 */
export function publishApiFiles(port: number, token: string): void {
  const { apiPortFile, apiTokenFile } = resolveAppContext();
  try {
    fs.mkdirSync(path.dirname(apiPortFile), { recursive: true });
    // With the process id, so a tool can tell a running API from a file a crashed run left behind
    writePrivateFile(apiPortFile, JSON.stringify({ port, pid: process.pid } satisfies ApiEndpoint));
  } catch {}

  if (process.env.NODE_ENV !== 'development' && !apiTokenIsOwn()) return;
  try {
    writePrivateFile(apiTokenFile, token);
    if (apiTokenIsOwn()) logger.info(`No ABUDDY_API_TOKEN given: clients send the token in ${apiTokenFile}`);
  } catch {}
}

export function createWebSocketServer() {
  const port = SERVER_CONFIG.port;
  const token = apiToken();

  const httpServer = http.createServer(handleHttpRequest);

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: ({ req }: { req: http.IncomingMessage }) => acceptsConnection(req.headers['sec-websocket-protocol'], token),
    // Answer with the app's protocol, never echoing the token one
    handleProtocols: (protocols: Set<string>) => protocols.has(API_PROTOCOL) ? API_PROTOCOL : false,
  });

  httpServer.listen(port, API_HOST, () => {
    // ! Log server startup (both to logger and console for main process) do not remove or modify
    const message = `✅ WebSocket Server listening on ws://localhost:${port} (tRPC endpoint: ws://localhost:${port}/trpc)`;
    console.log(message);

    publishApiFiles(port, token);
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

  // The parent died (Electron crashed, or was killed): its end of the IPC channel closed, so this process is
  // orphaned and shuts down the way a SIGTERM would. An API started without a channel — a manual boot, a test —
  // has no parent to outlive, so there is nothing to watch.
  if (process.connected) {
    process.on('disconnect', () => {
      console.log('[API] Parent process died, shutting down');
      process.kill(process.pid, 'SIGTERM');
    });
  }

  return { wss, handler, port };
}
