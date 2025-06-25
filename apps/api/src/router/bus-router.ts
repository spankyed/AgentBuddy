import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { IncomingEventSchema, type OutgoingSystemEvents } from '@/shared/events';
import { procedure, router } from './trpc';
import { createLogger } from '@/systems/logs/logger';
import { rootEvents } from '@/systems/logs/log-events';

const logger = createLogger('bus-router');

export const systemBusRouter = router({
  /** COMMAND / fire-and-forget */
  send: procedure
    .input(IncomingEventSchema)
    .mutation(({ ctx, input }) => {
      // Emit to root event emitter
      rootEvents.emitIncoming(input);
      
      // ctx.actor.send({
      //   type: 'INCOMING',
      //   event: input,
      // });
    }),
  /** EVENT STREAM out of the actor */
  sub: procedure
    // .input(z.object({ sessionId: z.string() }))
    .subscription(({ ctx }) =>
      observable<OutgoingSystemEvents>((emit) => {
        // Subscribe to root event emitter for outgoing events
        const unsubscribe = rootEvents.onOutgoing((event) => {
          const skipLogging = ['EMPTY', 'REQUEST_LOGS', 'LOG_ADDED'].includes(event.type);

          if (!skipLogging) {
            logger.info(`Outgoing message: "${event.type}"`);
          }

          emit.next(event);
        });

        rootEvents.emitConnected();

        return () => {
          logger.debug('Cleaning up subscription');
          unsubscribe();
        };
      }),
    ),
    // .subscription(async function* ({ ctx }) {
    //   const queue: OutgoingSystemEvents[] = [];

    //   const handler = (event: { event: OutgoingSystemEvents }) => {
    //     console.log('Notification received!', event);
    //     // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    //     queue.push(event as any);
    //   };

    //   ctx.actor.on('OUTGOING', handler);

    //   try {
    //     while (true) {
    //       // Wait until there's an item in the queue
    //       while (queue.length > 0) {
    //         // biome-ignore lint/style/noNonNullAssertion: <explanation>
    //         yield queue.shift()!;
    //       }
    //       await new Promise(resolve => setTimeout(resolve, 100)); // crude polling
    //     }
    //   } finally {
    //     // ctx.actor.off('OUTGOING', handler);
    //   }
    // }),
});

