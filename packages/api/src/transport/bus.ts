// Lets declaration emit name tRPC's router types through a public entry (TS2742 under bundler resolution)
import type {} from '@trpc/server/unstable-core-do-not-import';
import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Message } from '@abuddy/sdk/events';
import { receiveClientEvent, UnknownClientEventError } from '@abuddy/host/bus';
import { procedure, router } from './trpc';
import { createLogger } from '@abuddy/sdk/logger';
import { rootEvents } from '@/transport/emitter';
import { appPacks } from '@/runtime';

const logger = createLogger('app-events');

export const systemBusRouter = router({
  send: procedure
    // `from` and `via` are named rather than the object being made passthrough: who sent it is what a client may
    // add, and everything else it invents still goes no further than this line. zod strips what it isn't told
    // about, which silently cost every renderer send its sender. Every field of `Message` beside `event` belongs
    // here — a new one added to the envelope and not to this line arrives as `undefined`, and the diagnostics
    // written to name it can't.
    .input(z.object({ to: z.string().min(1), from: z.string().min(1).optional(), via: z.string().min(1).optional(), event: z.object({ type: z.string().min(1) }).passthrough() }))
    .mutation(({ input }) => {
      try {
        receiveClientEvent(appPacks, input);
      } catch (error) {
        if (error instanceof UnknownClientEventError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        throw error;
      }
    }),
  /**
   * The client finished loading a pack's frontend (at boot, on activation), whatever it added, or its
   * subscription reconnected: the pack's systems get CLIENT_CONNECTED, which the connection's broadcast and
   * the activation skip for external packs with frontend code. Their replies reach every client, not only
   * this one: outgoing events carry no client address.
   */
  packClientReady: procedure
    .input(z.object({ packId: z.string().min(1) }))
    .mutation(({ input }) => {
      logger.info(`→ Pack client ready: "${input.packId}"`, { packId: input.packId });
      rootEvents.emitPackClientConnected(input.packId);
    }),
  sub: procedure
    .subscription(() =>
      observable<Message>((emit) => {
        const unsubscribe = rootEvents.onOutgoing((message) => {
          emit.next(message);
        });

        rootEvents.emitConnected();

        return () => {
          logger.debug('Cleaning up subscription');
          unsubscribe();
        };
      }),
    ),
});
