// /apps/api/src/server.ts
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { createActor } from 'xstate';
import { db } from './db/client';
import { appRouter } from './router/bus';
import { busMachine } from './state/bus-state';

export const sharedActor = createActor(busMachine, {
  input: { model: 'gpt-4o' }
}).start();

export const createContext = () => ({
  db,
  actor: sharedActor
});

export type Context = ReturnType<typeof createContext>;

const wss = new WebSocketServer({ port: 3001, path: '/trpc' });

applyWSSHandler({ wss, router: appRouter, createContext });

console.log('[api] ws://localhost:3001/trpc');