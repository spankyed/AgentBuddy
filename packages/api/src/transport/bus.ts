// Lets declaration emit name tRPC's router types through a public entry (TS2742 under bundler resolution)
import type {} from '@trpc/server/unstable-core-do-not-import';
import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Message } from '@abuddy/sdk/events';
import { HOST, receiveClientEvent, UnknownClientEventError } from '@abuddy/host/bus';
import { splitRef } from '@abuddy/sdk/ids';
import { procedure, router } from './trpc';
import { createLogger } from '@abuddy/sdk/logger';
import { rootEvents } from '@/transport/emitter';
import { appClaims, appPacks } from '@/runtime';

const logger = createLogger('app-events');

export const systemBusRouter = router({
  send: procedure
    // Every field of `Message` beside `event` is named here rather than the object being made passthrough: zod
    // strips what it isn't told about, so a field this line omits arrives as `undefined`, while everything a
    // client invents still goes no further than here.
    //
    // `client` is omitted on purpose, and is the one field that must stay omitted: it is stamped from the
    // connection below rather than accepted, so a sender cannot claim another connection's address. The server
    // knows it for free, so taking it from the wire would be strictly worse for no gain.
    //
    // `sender` is named, and that is not the same decision. It is where an answer goes, and a client has to be
    // able to say — a window knows which of its plugins asked, and a participant which name it claimed. Trusting
    // it costs nothing here: every caller already holds the API token, which lets it send anything to anything,
    // so a forged `sender` is a bug rather than an escalation.
    .input(z.object({ to: z.string().min(1), from: z.string().min(1).optional(), via: z.string().min(1).optional(), sender: z.string().min(1).optional(), event: z.object({ type: z.string().min(1) }).passthrough() }))
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
  /**
   * Takes a name on this connection, so something that is not a pack's feature can be sent to: an agent driving
   * the app claims `host/drive`, and from then on `sendToSystem('host/drive', …)` and a system's `reply` reach
   * it. The claim dies with the connection, so nothing has to give it back.
   *
   * A name another live connection holds is refused rather than taken over. Since a claim cannot outlive its
   * socket, a reconnect always finds the name free — so a collision means two drivers really are running, and
   * letting the newest win would send one of them the other's answers and look like it worked.
   */
  claim: procedure
    .input(z.object({ as: z.string().min(1) }))
    .mutation(({ input, ctx }) => {
      if (!splitRef(input.as)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `"${input.as}" doesn't name a participant: a name is "<packId>/<featureId>", as "${HOST.drive}" is` });
      }
      const outcome = appClaims.claim(input.as, ctx.client);
      if (!outcome.ok) {
        throw new TRPCError({ code: 'CONFLICT', message: `"${input.as}" is already claimed by another connection. Close the other drive session, or claim a different name.` });
      }
      logger.info(`→ Claimed "${input.as}"`, { as: input.as });
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
          // Whatever this connection claimed goes with it. The claim is keyed by an id minted per socket, so there
          // is nothing to reconcile: the name is simply free again for the next drive session.
          appClaims.release(ctx.client);
        };
      }),
    ),
});
