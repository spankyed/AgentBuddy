import type {} from '@trpc/server/unstable-core-do-not-import';
import { installedEngine, type EARS } from '@apackdev/ears';
import { z } from 'zod';
import { procedure, router } from './trpc';

export const entitiesRouter = router({
  exists: procedure.input(z.object({ id: z.custom<EARS.EntityId>(value =>
    typeof value === 'string' && value.includes('-'), 'Expected an entity ID') }))
    .query(({ input }) => installedEngine().findById(input.id) !== undefined),
});
