// /apps/api/src/server.ts
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { appRouter } from './router/_app';
import { createContext } from './context';

const wss = new WebSocketServer({ port: 3001, path: '/trpc' });

applyWSSHandler({ wss, router: appRouter, createContext });

console.log('[api] ws://localhost:3001/trpc');