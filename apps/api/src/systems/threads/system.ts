import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
import { EARS } from '@/shared/ears/types';
import { z } from 'zod';
import { createThread, getExtendedData, updateThreadField } from './repository';
import type { ThreadEditFields, ThreadEntity, ThreadLinkItem, ThreadStartupData } from '@/types';
import { ThreadRelations, type ThreadExtendedData, type ThreadTagItem } from './types';
import type { MappedZodLiterals } from '@/shared/utils/type-helpers';
import threadStartupData from './repository/startup';

export const threads = 'threads' as const;

const busEvent = systemBus(threads);

const tagsSchema = z.array(z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
})).optional();

const threadSchema = {
  topic: z.string(),
  threadType: z.string(),
  tags: tagsSchema,
  instructions: z.string(),
  // status: z.union(
  //   ThreadStatuses.map(r => z.literal(r)) as MappedZodLiterals<typeof ThreadStatuses>,
  // ),
};

const relatedThreadsSchema = z.array(z.object({
  id: z.string(),
  relation: z.union(
    ThreadRelations.map(r => z.literal(r)) as MappedZodLiterals<typeof ThreadRelations>,
  ),
}))

export const IncomingThreadsEvents = [
  busEvent('CREATE_THREAD', {
    ...threadSchema,
    linkedThreads: relatedThreadsSchema.optional(),
  }),
  busEvent('VIEW_THREAD', { threadId: z.string() }),
  busEvent('UPDATE_THREAD_FIELD', {
    threadId: z.string(),
    key: z.string(),
    value: z.any(),
  }),
] as const

export type ThreadsInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }
  | SystemEvents
  

export type OutgoingThreadsEvents = 
  | { type: 'THREAD_STARTUP'; data: ThreadStartupData }
  | { type: 'SET_VIEW_DATA', id: EARS.EntityId, data: ThreadExtendedData }
  | { type: 'THREAD_CREATED', id: EARS.EntityId, shortCode: string, entityType: EARS.Entity, timestamp: number }

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
    sendThreadsStartupData: ({ system }) => {
      system.get(bus).send(emit(threads, { 
        type: 'THREAD_STARTUP',
        data: threadStartupData()
      }));
    },
    createThread: ({ system, event }) => {
      const thread = typeOf('CREATE_THREAD', event);

      const { id: newThreadId, shortCode, timestamp } = createThread(
        {
          topic: thread.topic,
          threadType: thread.threadType as ThreadEntity['threadType'],
          instructions: thread.instructions,
          tags: thread.tags as ThreadTagItem[],
          linkedThreads: thread.linkedThreads as ThreadLinkItem[],
        },
      );

      system.get(bus).send(emit(threads, { 
        type: 'THREAD_CREATED',
        id: newThreadId,
        shortCode,
        entityType: EARS.Entity.Thread,
        timestamp,
      }));
    },
    sendViewData: ({ system, event }) => {
      const threadId = typeOf('VIEW_THREAD', event).threadId as EARS.EntityId;

      system.get(bus).send(emit(threads, { 
        type: 'SET_VIEW_DATA',
        id: threadId,
        data: getExtendedData(threadId),
      }));
    },
    updateThreadField: ({ event }) => {
      const { key, value, threadId } = typeOf('UPDATE_THREAD_FIELD', event);
      updateThreadField(
        threadId as EARS.EntityId,
        key as keyof ThreadEditFields,
        value as ThreadEditFields[keyof ThreadEditFields],
      );
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
      CLIENT_CONNECTED: {
        actions: 'sendThreadsStartupData',
      },
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
          UPDATE_THREAD_FIELD: {
            actions: 'updateThreadField',
          },
        },
      },
    },
  }
);
