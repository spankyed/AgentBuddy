import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus } from '@/systems/_bus/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import type { EARS } from '@/shared/ears/types';
import { z } from 'zod';
import { createThread, getViewData } from './accessors';
import type { MessageEntity, ThreadEntity } from '@/types';
import type { ThreadsViewData } from './types';

export const threads = 'threads' as const;

const busEvent = systemBus(threads);

export const IncomingThreadsEvents = [
  busEvent('CREATE_THREAD', {
    topic: z.string(),
    threadType: z.string(),
    tags: z.array(z.string()),
    relatedThreads: z.array(z.string()),
    instructions: z.string(),
  }),
  busEvent('VIEW_THREAD', { threadId: z.string() }),
] as const

export type ThreadsInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }

export type OutgoingThreadsEvents = 
  | { type: 'SET_VIEW_DATA', id: EARS.EntityId, data: ThreadsViewData }
  | { type: 'THREAD_CREATED', id: EARS.EntityId }

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
    createThread: ({ system, event }) => {
      const thread = typeOf('CREATE_THREAD', event);
      console.log(thread);

      // const threadId = createThread(
      //   {
      //     entityType: EARS.Entity.Thread,
      //     topic: thread.topic,
      //     threadType: thread.threadType as ThreadEntity['threadType'],
      //     timestamp: Date.now(),
      //     // shortCode: '',
      //     // status: 'active',
      //   },
      //   thread.tags,
      //   thread.relatedThreads,
      // );

      // system.get(bus).send(emit(threads, { 
      //   type: 'THREAD_CREATED',
      //   id: threadId,
      // }));
    },
    sendViewData: ({ system, event }) => {
      const threadId = typeOf('VIEW_THREAD', event).threadId as EARS.EntityId;

      system.get(bus).send(emit(threads, { 
        type: 'SET_VIEW_DATA',
        id: threadId,
        data: getViewData(threadId),
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
          CREATE_THREAD: {
            actions: 'createThread',
          },
          VIEW_THREAD: {
            actions: 'sendViewData',
          },
        },
      },
    },
  }
);
