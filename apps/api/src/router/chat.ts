import { router, procedure } from '../trpc';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { observable } from '@trpc/server/observable';
import { message, session } from '../db/schema';

export const chatRouter = router({
  openSession: procedure
    .input(z.object({ model: z.string().default('gpt-4o') }))
    .output(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const id = uuid();
      await ctx.db.insert(session).values({
        id,
        model: input.model,
        createdAt: new Date(),
      }).run();
      return { sessionId: id };
    }),

  userMessage: procedure
    .input(z.object({ sessionId: z.string(), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(message).values({
        id: uuid(),
        sessionId: input.sessionId,
        role: 'user',
        content: input.content,
        createdAt: new Date(),
      }).run();

      ctx.getAgent(input.sessionId, 'gpt-4o').send({
        type: 'USER_MSG',
        content: input.content,
      });
    }),

  onToken: procedure
    .input(z.object({ sessionId: z.string() }))
    .subscription(({ ctx, input }) =>
      observable<{ token: string }>((emit) => {
        const agent = ctx.getAgent(input.sessionId, 'gpt-4o');
        const sub = agent.subscribe((ev) => {
          if (ev.type === 'TOKEN') emit.next({ token: ev.token });
        });
        return () => sub.unsubscribe();
      })
    ),

  abort: procedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(({ ctx, input }) => {
      ctx.getAgent(input.sessionId, 'gpt-4o').send('CANCEL');
    }),
});