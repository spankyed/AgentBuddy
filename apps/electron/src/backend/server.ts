import 'dotenv/config';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { createActor } from 'xstate';
import net from 'net';

// Import from the built API dist files directly
// @ts-ignore - API modules are built separately
const apiPath = require.resolve('@abuddy/api');
const apiDir = require('path').dirname(apiPath);

// @ts-ignore
const { appRouter } = require(require('path').join(apiDir, 'core/router/index.js'));
// @ts-ignore
const { createContext } = require(require('path').join(apiDir, 'core/router/context.js'));
// @ts-ignore
const { logsSystem } = require(require('path').join(apiDir, 'systems/logs/system.js'));
// @ts-ignore
const { backendSystem, bus } = require(require('path').join(apiDir, 'systems/backend.js'));
// @ts-ignore
const { loadSnapshot } = require(require('path').join(apiDir, 'core/data/index.js'));
// @ts-ignore
const { logErrors } = require(require('path').join(apiDir, 'core/utils/actor-helpers.js'));
// @ts-ignore
const { logger } = require(require('path').join(apiDir, 'core/utils/debug/logger.js'));
// @ts-ignore
const { initializeLogCapture } = require(require('path').join(apiDir, 'core/utils/debug/log-capture.js'));

// Find an available port
function findAvailablePort(startPort: number = 3001): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.listen(startPort, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, try the next one
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

export async function startBackendServer(): Promise<number> {
  try {
    // Load snapshot data
    await loadSnapshot();
    
    // Initialize log capture
    initializeLogCapture();
    
    // Start logs actor
    const logsActor = createActor(logsSystem).start();
    logsActor.subscribe(logErrors('Logs'));
    
    // Start backend actor system
    const backendActor = createActor(backendSystem, {
      systemId: bus,
    }).start();
    
    backendActor.subscribe(logErrors('Backend'));
    
    // Find available port
    const port = await findAvailablePort();
    
    // Start WebSocket server
    const wss = new WebSocketServer({ port, path: '/trpc' });
    
    logger.info(`✅ Electron Backend Server listening on ws://localhost:${port}`);
    
    // Apply tRPC WebSocket handler
    const handler = applyWSSHandler({ 
      wss, 
      router: appRouter as any, 
      createContext 
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      handler.broadcastReconnectNotification();
      wss.close();
    });
    
    return port;
  } catch (error) {
    logger.error('Failed to start backend server:', error as any);
    throw error;
  }
}