// Lets declaration emit name tRPC's router types through a public entry (TS2742 under bundler resolution)
import type {} from '@trpc/server/unstable-core-do-not-import';
import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { IncomingSystemEvents, OutgoingSystemEvents } from '@/core/router/events';
import { receiveClientEvent, UnknownClientEventError } from '@abuddy/host/bus';
import { procedure, router } from './trpc';
import { createLogger } from '@abuddy/sdk/logger';
import { rootEvents } from '@/core/router/bus-emitter';
import { appPacks } from '@/setup/backend';

const logger = createLogger('app-events');

export const systemBusRouter = router({
  send: procedure
    .input(z.custom<IncomingSystemEvents>((val) =>
      typeof val === 'object' && val !== null && 'type' in val && 'systemId' in val
    ))
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
