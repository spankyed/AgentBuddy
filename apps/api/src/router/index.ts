import { pluginBusRouter } from './bus-router';
import { router } from './trpc';

export const appRouter = router({ bus: pluginBusRouter });

export type AppRouter = typeof appRouter;
