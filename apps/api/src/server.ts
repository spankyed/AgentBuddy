import 'dotenv/config'

import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { appRouter } from '@/router';
import { createContext } from '@/router/context';
import { logger } from '@/systems/logs/logger';

const port = 3001;

const wss = new WebSocketServer({ port, path: '/trpc' });

applyWSSHandler({ wss, router: appRouter, createContext });

logger.info(`[api] ws://localhost:${port}/trpc`);