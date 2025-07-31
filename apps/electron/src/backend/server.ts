import 'dotenv/config';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import net from 'net';
import { minimalAppRouter } from './minimal-router';

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
    // Find available port
    const port = await findAvailablePort();
    
    // Start WebSocket server
    const wss = new WebSocketServer({ port, path: '/trpc' });
    
    console.log(`✅ Electron Backend Server (minimal) listening on ws://localhost:${port}`);
    
    // Apply tRPC WebSocket handler with minimal router
    const handler = applyWSSHandler({ 
      wss, 
      router: minimalAppRouter,
      createContext: async () => ({}) 
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      handler.broadcastReconnectNotification();
      wss.close();
    });
    
    return port;
  } catch (error) {
    console.error('Failed to start backend server:', error);
    throw error;
  }
}