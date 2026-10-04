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
    // Every field of `Message` beside `event` is named here rather than the object being made passthrough: zod
    // strips what it isn't told about, so a field this line omits arrives as `undefined`, while everything a
    // client invents still goes no further than here.
    //
    // `client` is omitted on purpose, and is the one field that must stay omitted. It is a return address that
    // routes, so it is stamped from the connection below rather than accepted from the sender; naming it here
    // would let a client claim to be another one.
    .input(z.object({ to: z.string().min(1), from: z.string().min(1).optional(), via: z.string().min(1).optional(), event: z.object({ type: z.string().min(1) }).passthrough() }))
    .mutation(({ input, ctx }) => {
      try {
        receiveClientEvent(appPacks, { ...input, client: ctx.client });
      } catch (error) {
        if (error instanceof UnknownClientEventError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        throw error;
      }
    }),
  /**
   * The client finished loading a pack's frontend (at boot, on activation), whatever it added, or its
   * subscription reconnected: the pack's systems get CLIENT_CONNECTED, which the connection's broadcast and
   * the activation skip for external packs with frontend code. Their replies still reach every client rather
   * than this one — not because an outgoing message cannot name a connection, which it can, but because a
   * system answering CLIENT_CONNECTED sends its startup data with `broadcastToPlugin`, which names none. That
   * is the right reach for it: the data is for every window showing the plugin, not for whoever connected.
   */
  packClientReady: procedure
    .input(z.object({ packId: z.string().min(1) }))
    .mutation(({ input }) => {
      logger.info(`→ Pack client ready: "${input.packId}"`, { packId: input.packId });
      rootEvents.emitPackClientConnected(input.packId);
    }),
  sub: procedure
    .subscription(({ ctx }) =>
      observable<Message>((emit) => {
        const unsubscribe = rootEvents.onOutgoing((message) => {
          // Absent `client` means every connection, which is what a notification is: a mutation broadcast is
          // aimed at every view, and a plugin runs once per window. A message that names a connection is an
          // answer to something that connection asked, and goes only there.
          if (message.client !== undefined && message.client !== ctx.client) return;
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
