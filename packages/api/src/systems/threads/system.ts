import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/core/utils/actor-helpers';
import { EARS } from '@/core/types';
import { z } from 'zod';
import { repository } from '@/repository';
import { tx } from '@/core/utils/ears/helpers/transaction';
import type { ThreadEditFields, ThreadEntity, ThreadLinkItem, ThreadConnectedData } from '@/types';
import { ThreadRelations, type ThreadExtendedData } from './types';
import type { MappedZodLiterals } from '@/core/utils/type-helpers';
import { agent } from '@/systems/agent/system';
import { type ChangeBlock, toMap, toIdentifierSet, mapScalar, mapArray } from '@/systems/settings/settings-changes';

export const threads = 'threads' as const;

const busEvent = systemBus(threads);

const tagsSchema = z.array(z.string()).optional();  // Just tag names

const threadSchema = {
  topic: z.string(),
  threadType: z.string(),
  tags: tagsSchema,
  instructions: z.string(),
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
    parentThreadId: z.string().optional(), // Add support for parent thread
  }),
  busEvent('VIEW_THREAD', { threadId: z.string() }),
  busEvent('UPDATE_THREAD_STATUS', {
    threadId: z.string(),
    status: z.string(), // Dynamic statuses from settings
  }),
  busEvent('UPDATE_THREAD_FIELD', {
    threadId: z.string(),
    key: z.string(),
    value: z.any(),
  }),
] as const

export type ThreadsInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }
  | SystemEvents
  | { type: 'THREADS_SETTINGS_UPDATED'; settings: any; changes?: any }
  

export type OutgoingThreadsEvents = 
  | { type: 'THREAD_CONNECTED'; data: ThreadConnectedData }
  | { type: 'SET_VIEW_DATA', id: EARS.EntityId, data: ThreadExtendedData }
  | { type: 'THREAD_CREATED', id: EARS.EntityId, shortCode: string, entityType: EARS.Entity, timestamp: number, topic?: string, threadType?: ThreadEntity['threadType'], instructions?: string, status?: string }
  | { type: 'THREAD_UPDATED', threadId: string, updates: Partial<Pick<ThreadEntity, 'status' | 'tags'>> }

export interface ThreadsContext {}

export const ThreadsSystemEvents = fromSystem(IncomingThreadsEvents)<OutgoingThreadsEvents, typeof threads>()
type ReceivableEvents = MergeReceivable<typeof IncomingThreadsEvents, ThreadsInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

export const threadsSystem = setup({
  types: {
    context: {} as ThreadsContext,
    events: {} as ReceivableEvents,
  },
  actions: {
    sendThreadsConnectedData: ({ system }) => {
      const connectedData = repository.threadQueries.connectedData();
      const threadsSettings = repository.settingsQueries.getPluginSettings('threads');
      
      system.get(bus).send(emit(threads, { 
        type: 'THREAD_CONNECTED',
        data: {
          ...connectedData,
          settings: threadsSettings || null
        }
      }));
    },
    createThread: ({ system, event }) => {
      const thread = typeOf('CREATE_THREAD', event);

      const { id: newThreadId, shortCode, timestamp } = repository.threadCommands.create({
        topic: thread.topic,
        threadType: thread.threadType as ThreadEntity['threadType'],
        instructions: thread.instructions,
        tags: thread.tags as string[],  // Tag names
        linkedThreads: thread.linkedThreads as ThreadLinkItem[],
      });

      // If this thread is being created as a child of another thread,
      // update the parent thread to link to this child
      if (thread.parentThreadId) {
        repository.threadCommands.update(
          thread.parentThreadId as EARS.EntityId,
          {
            linkedThreads: [{
              id: newThreadId,
              relation: 'parent_of' as const
            }]
          }
        );
      }

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
        data: repository.threadQueries.extendedData(threadId),
      }));
    },
    updateThreadField: ({ system, event }) => {
      const { key, value, threadId } = typeOf('UPDATE_THREAD_FIELD', event);
      const updates = { [key]: value };
      repository.threadCommands.update(threadId as EARS.EntityId, updates);
      
      // If status was updated, emit events and refresh dashboard
      if (key === 'status') {
        // Emit status update event to threads plugin
        system.get(bus).send(emit(threads, { 
          type: 'THREAD_UPDATED',
          threadId,
          updates: { status: value as string },
        }));
        
        // Trigger dashboard refresh in agent system
        const agentActor = system.get(agent);
        agentActor.send({ type: 'REFRESH_DASHBOARD' });
      }
    },
    updateThreadStatus: ({ system, event }) => {
      const { threadId, status } = typeOf('UPDATE_THREAD_STATUS', event);
      const updates = { 
        status,
        updatedAt: Date.now() 
      };
      repository.threadCommands.update(threadId as EARS.EntityId, updates);
      
      // Emit status update event to threads plugin
      system.get(bus).send(emit(threads, { 
        type: 'THREAD_UPDATED',
        threadId,
        updates: { status },
      }));
      
      // Trigger dashboard refresh in agent system
      const agentActor = system.get(agent);
      agentActor.send({ type: 'REFRESH_DASHBOARD' });
    },
    handleSettingsUpdate: ({ system, event }) => {
      const firstStatusLabel = (): string | undefined =>
        repository.settingsQueries.getPluginSettings('threads')?.statuses?.[0]?.label;

      const { changes } = typeOf('THREADS_SETTINGS_UPDATED', event);
      if (!changes) return;

      const busSvc = system.get(bus);

      // ----- Status changes -----
      const sBlock = (changes.statuses || changes) as ChangeBlock | undefined;
      const sRenames = toMap(sBlock?.renames);
      // Statuses use 'label' property as identifier
      const sRemoved = toIdentifierSet(sBlock?.removed, (item: any) => item.label);
      const statusNeedsWork = sRenames.size || sRemoved.size;

      // Fallback for removed statuses: prefer first available status, else keep old.
      const statusFallback = () => firstStatusLabel();

      // ----- Tag changes -----
      const tBlock = changes.tags as ChangeBlock | undefined;
      const tRenames = toMap(tBlock?.renames);
      // Tags use 'name' property as identifier
      const tRemoved = toIdentifierSet(tBlock?.removed, (item: any) => item.name);
      const tagNeedsWork = tRenames.size || tRemoved.size;

      if (!statusNeedsWork && !tagNeedsWork) return;

      let touched = false;

      for (const th of repository.threadQueries.all()) {
        const patch: { status?: string; tags?: string[] } = {};

        if (statusNeedsWork) {
          const nextStatus = mapScalar(th.status, sRenames, sRemoved, statusFallback);
          if (nextStatus !== th.status && nextStatus) {
            patch.status = nextStatus;
          }
        }

        if (tagNeedsWork) {
          const { next: nextTags, changed } = mapArray(th.tags, tRenames, tRemoved);
          if (changed) {
            patch.tags = nextTags;
          }
        }

        if (Object.keys(patch).length) {
          repository.threadCommands.update(th.id, patch);
          busSvc.send(emit(threads, { type: 'THREAD_UPDATED', threadId: th.id, updates: patch }));
          touched = true;
        }
      }

      if (touched) {
        busSvc.send(
          emit(threads, {
            type: 'THREAD_CONNECTED',
            data: {
              ...repository.threadQueries.connectedData(),
              settings: repository.settingsQueries.getPluginSettings('threads') ?? null,
            },
          })
        );
      }

      system.get(agent).send({ type: 'REFRESH_DASHBOARD' });
    },
  },
}).createMachine(
  {
    id: threads,
    initial: 'idle',
    context: ({ input }) => ({}),
    on: {
      CLIENT_CONNECTED: {
        actions: 'sendThreadsConnectedData',
      },
      THREADS_SETTINGS_UPDATED: {
        actions: 'handleSettingsUpdate',
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
          UPDATE_THREAD_STATUS: {
            actions: 'updateThreadStatus',
          },
        },
      },
    },
  }
);
