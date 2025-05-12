import { router } from '../trpc';
import { apiRouter } from './chat';
export const appRouter = router({ api: apiRouter });
export type AppRouter = typeof appRouter;
