import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { IncomingEventSchema, type OutgoingPluginEvents } from '@/shared/events';
import { procedure, router } from './trpc';

export const pluginBusRouter = router({
  /** COMMAND / fire-and-forget */
  send: procedure
    .input(IncomingEventSchema)
    .mutation(({ ctx, input }) => {
      ctx.actor.send({
        type: 'INCOMING',
        event: input,
      });
    }),

  /** EVENT STREAM out of the actor */
  sub: procedure
    .input(z.object({ sessionId: z.string() }))
    .subscription(({ ctx }) =>
      observable<OutgoingPluginEvents>((emit) => {
        return ctx.actor.on('OUTGOING', ({ event }) => {
          console.log('Notification received!', event);
          emit.next(event);
        });
      }),
    ),
});
