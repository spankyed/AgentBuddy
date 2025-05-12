import type { OutgoingPluginEvents } from '../shared/events';
import { initTRPC } from '@trpc/server';
import type { Context } from './context';
import { pluginBusRouter } from './bus-router';
const t = initTRPC.context<Context>().create();

export const router    = t.router;
export const procedure = t.procedure;
export const mergeRouters = t.mergeRouters;

export const appRouter = router({ bus: pluginBusRouter });

export type AppRouter = typeof appRouter;
