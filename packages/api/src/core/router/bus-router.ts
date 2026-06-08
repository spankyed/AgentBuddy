import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { OutgoingSystemEvents } from '@/core/router/events';
import type { IncomingSystemEvents } from '@/systems';
import { eventValidationMap } from '@/systems';
import { procedure, router } from './trpc';
import { createLogger } from '@/core/shared/debug/logger';
import { rootEvents } from '@/core/router/bus-emitter';

const logger = createLogger('app-events');

function summarizeEventForLog(event: IncomingSystemEvents) {
  if (event.systemId === 'browser' && event.type === 'SYNC_TABS' && 'tabs' in event && Array.isArray(event.tabs)) {
    return {
      ...event,
      tabs: {
        count: event.tabs.length,
        sample: event.tabs.slice(0, 5).map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          displayOrder: tab.displayOrder,
          groupId: tab.groupId,
        })),
      },
    };
  }

  return event;
}

export const systemBusRouter = router({
  send: procedure
    .input(z.custom<IncomingSystemEvents>((val) =>
      typeof val === 'object' && val !== null && 'type' in val && 'systemId' in val
    ))
    .mutation(({ input }) => {
      const validTypes = eventValidationMap.get(input.systemId);
      if (!validTypes) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown system: "${input.systemId}"` });
      }
      if (!validTypes.has('*') && !validTypes.has(input.type)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown event "${input.type}" for system "${input.systemId}"` });
      }

      logger.info(`→ Incoming: "${input.type}"`, { event: summarizeEventForLog(input) });
      rootEvents.emitIncoming(input);
    }),
  sub: procedure
    // .input(z.object({ sessionId: z.string() }))
    .subscription(() =>
      observable<OutgoingSystemEvents>((emit) => {
        // Subscribe to root event emitter for outgoing events
        const unsubscribe = rootEvents.onOutgoing((event) => {
          const skipLogging = ['EMPTY', 'REQUEST_LOGS', 'LOG_ADDED'].includes(event.type);

          if (!skipLogging) {
            // logger.info(`← Outgoing: "${event.type}"`);
            // logger.info(`← Outgoing: "${event.type}"`, { event });
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

export type SystemBusRouter = typeof systemBusRouter;
