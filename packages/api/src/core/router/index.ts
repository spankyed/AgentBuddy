import { systemBusRouter } from './bus-router';
import { packsRouter } from '@/packs/pack-api';
import { router } from './trpc';

export const appRouter = router({ bus: systemBusRouter, packs: packsRouter });

export type AppRouter = typeof appRouter;
