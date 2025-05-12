import { router, procedure } from '../trpc';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import type { BusEvent } from '../state/bus-state';
import { IncomingEventSchema, type OutgoingPluginEvents } from '../shared/events';

export const busRouter = router({
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
        const sub = ctx.actor.subscribe((snapshot) => {
          if ('type' in snapshot && snapshot.type === 'OUTGOING') {
            emit.next(snapshot.event);
          }
        });

        return () => sub.unsubscribe();
      }),
    ),
});
