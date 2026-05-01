import { observable } from '@trpc/server/observable';
import typia from 'typia';
import type { OutgoingSystemEvents } from '@/core/router/events';
import type { IncomingSystemEvents } from '@/systems';
import { procedure, router } from './trpc';
import { createLogger } from '@/core/helpers/debug/logger';
import { rootEvents } from '@/core/router/bus-emitter';

const logger = createLogger('app-events');

export const systemBusRouter = router({
  send: procedure
    .input(typia.createAssert<IncomingSystemEvents>())
    .mutation(({ input }) => {
      logger.info(`→ Incoming: "${input.type}"`, { event: input });
      rootEvents.emitIncoming(input);
    }),
  sub: procedure
    .subscription(() =>
      observable<OutgoingSystemEvents>((emit) => {
        const unsubscribe = rootEvents.onOutgoing((event) => {
          emit.next(event);
        });

        rootEvents.emitConnected();

        return () => {
          logger.debug('Cleaning up subscription');
          unsubscribe();
        };
      }),
    ),
});

export type SystemBusRouter = typeof systemBusRouter;
