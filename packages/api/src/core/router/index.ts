import { systemBusRouter } from './bus-router';
import { router } from './trpc';

export const appRouter = router({ bus: systemBusRouter });

export type AppRouter = typeof appRouter;
