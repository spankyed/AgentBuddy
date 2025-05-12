import { router, procedure } from '../trpc';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { type WireEvent, WireEventSchema } from '../shared/rpc-events';
import type { Ev } from '../state/bus';

export const busRouter = router({
  /** COMMAND / fire-and-forget */
  send: procedure
    .input(WireEventSchema)
    .mutation(({ ctx, input }) => {
      ctx.actor.send(input as Ev);
    }),

  /** EVENT STREAM out of the actor */
  sub: procedure
    .input(z.object({ sessionId: z.string() }))
    .subscription(({ ctx }) =>
      observable<WireEvent>((emit) => {
        const sub = ctx.actor.subscribe((snapshot) => {
          if ('type' in snapshot) {
            emit.next(snapshot as WireEvent);
          }
        });

        return () => sub.unsubscribe();
      }),
    ),
});
