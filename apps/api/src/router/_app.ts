import { router } from '../trpc';
import { busRouter } from './bus';

export const appRouter = router({ bus: busRouter });
export type AppRouter = typeof appRouter;
