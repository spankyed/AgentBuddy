// Lets declaration emit name tRPC's router types through a public entry (TS2742 under bundler resolution)
import type {} from '@trpc/server/unstable-core-do-not-import';
import { systemBusRouter } from './bus';
import { packsRouter } from './packs';
import { secretsRouter } from './secrets';
import { router } from './trpc';

export const appRouter = router({ bus: systemBusRouter, packs: packsRouter, secrets: secretsRouter });

export type AppRouter = typeof appRouter;
