import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus } from '@/systems/_bus/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import type { EARS } from '@/shared/ears/types';
import { z } from 'zod';
import { getThreadMessages } from './accessors';
import type { MessageEntity } from '@/types';

export const threads = 'threads' as const;

const busEvent = systemBus(threads);

export const IncomingThreadsEvents = [
  busEvent('CREATE_THREAD', { content: z.string() }),
  busEvent('VIEW_THREAD', { threadId: z.string() }),
] as const

export type ThreadsInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }

export type OutgoingThreadsEvents = 
  | { type: 'VIEW_DATA', threadId: EARS.EntityId, messages: Partial<MessageEntity>[] }

export interface ThreadsContext {
  threadsId: EARS.EntityId;
}

export const ThreadsSystemEvents = fromSystem(IncomingThreadsEvents)<OutgoingThreadsEvents, typeof threads>()
type ReceivableEvents = MergeReceivable<typeof IncomingThreadsEvents, ThreadsInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

export const threadsSystem = setup({
  types: {
    context: {} as ThreadsContext,
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    sendViewData: ({ system, event }) => {
      const threadId = typeOf('VIEW_THREAD', event).threadId as EARS.EntityId;
      const messages = getThreadMessages(threadId);

      system.get(bus).send(emit('application', { 
        type: 'VIEW_DATA',
        threadId,
        messages,
      }));
    },
  },
}).createMachine(
  {
    id: threads,
    initial: 'idle',
    context: ({ input }) => ({
      threadsId: input,
    }),
    on: {
    },
    states: {
      idle: {
        on: {
          VIEW_THREAD: {
            actions: 'sendViewData',
          },
        },
      },
    },
  }
);
