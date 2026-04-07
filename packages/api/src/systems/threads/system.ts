import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/helpers/event-helpers';
import { fromSystem, systemBus } from '@/core/helpers/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/core/helpers/actor-helpers';
import { EARS } from '@/core/types';
import { z } from 'zod';
import { repository } from '@/repository';
import { tx } from '@/core/ears/helpers/transaction';
import type { ThreadEditFields, ThreadEntity, ThreadLinkItem, ThreadConnectedData, MessageEntity, BlockConfig, AgentThreadData, AgentConnectedData, AgentSettings, RecentThreadRefreshData, CommandItem } from '@/types';
import { ThreadRelations, type ThreadExtendedData } from './types';
import type { MappedZodLiterals } from '@/core/helpers/type-helpers';
import { type ChangeBlock, toMap, toIdentifierSet, mapScalar, mapArray } from '@/systems/settings/settings-changes';
import { exportThreads } from './export-threads';
import { importThreads } from './import-threads';
import { brain } from '../brain/system';
import services from '@/services';
import { createLogger } from '@/core/helpers/debug/logger';
import type { FieldContent } from '@/systems/library/types';

const logger = createLogger('threads');

export const threads = 'threads' as const;

const busEvent = systemBus(threads);

const tagsSchema = z.array(z.string()).optional();

const threadSchema = {
  topic: z.string(),
  tags: tagsSchema,
  instructions: z.string(),
};

const relatedThreadsSchema = z.array(z.object({
  id: z.string(),
  relation: z.union(
    ThreadRelations.map(r => z.literal(r)) as MappedZodLiterals<typeof ThreadRelations>,
  ),
}))

const referencesSchema = z.object({
  images: z.array(z.object({ url: z.string(), name: z.string() })).optional(),
  files: z.array(z.object({
    name: z.string(),
    path: z.string(),
    typeLabel: z.string(),
    isImage: z.boolean(),
  })).optional(),
  context: z.array(z.object({
    refType: z.enum(['thread', 'document', 'note', 'task', 'tasklist', 'folder']),
    refId: z.string(),
    shortCode: z.string(),
    label: z.string(),
  })).optional(),
}).optional();

export const IncomingThreadsEvents = [
  // Thread management events
  busEvent('CREATE_THREAD', {
    ...threadSchema,
    linkedThreads: relatedThreadsSchema.optional(),
    parentThreadId: z.string().optional(),
  }),
  busEvent('VIEW_THREAD', { threadId: z.string() }),
  busEvent('UPDATE_THREAD_STATUS', {
    threadId: z.string(),
    status: z.string(),
  }),
  busEvent('UPDATE_THREAD_FIELD', {
    threadId: z.string(),
    key: z.string(),
    value: z.any(),
  }),
  busEvent('DELETE_THREAD', { threadId: z.string() }),
  busEvent('EXPORT_THREADS', { directory: z.string() }),
  busEvent('IMPORT_THREADS', { directory: z.string() }),

  // Chat/agent events (merged from agent system)
  busEvent('USER_MSG', {
    text: z.string(),
    mode: z.string().optional(),
    phase: z.string().optional(),
    threadId: z.string().optional(),
    references: referencesSchema,
  }),
  busEvent('OPEN_THREAD_CHAT', { threadId: z.string() }),
  busEvent('OPEN_THREAD_TAB', { threadId: z.string(), label: z.string(), pinned: z.boolean().optional() }),
  busEvent('CANCEL'),
  busEvent('APPROVE_TODO_LIST', { artifactId: z.string(), tasks: z.array(z.any()) }),
  busEvent('REJECT_TODO_LIST', { artifactId: z.string() }),
  busEvent('INTERACTIVE_MSG_RESPONSE', {
    messageId: z.string(),
    threadId: z.string(),
    response: z.any(),
  }),
  busEvent('FORK_THREAD', {
    messageId: z.string(),
    threadId: z.string().optional(),
    threadTopic: z.string().optional(),
  }),
  busEvent('REVERT_THREAD', {
    messageId: z.string(),
    threadId: z.string(),
  }),
  busEvent('USER_COMMAND', {
    command: z.string(),
    text: z.string(),
    mode: z.string().optional(),
    phase: z.string().optional(),
    threadId: z.string().optional(),
    references: referencesSchema,
  }),
] as const

export type ThreadsInternalEvents =
  | { type: 'CLIENT_CONNECTED' }
  | SystemEvents
  | { type: 'THREADS_SETTINGS_UPDATED'; settings: any; changes?: any }
  | { type: 'API_KEYS_CHANGED' }
  | { type: 'BIRTH_FLOW_START' }
  | { type: 'THREAD_DELETED'; threadId: string }

export type OutgoingThreadsEvents =
  // Thread management events
  | { type: 'THREAD_CONNECTED'; data: ThreadConnectedData }
  | { type: 'SET_VIEW_DATA', id: EARS.EntityId, data: ThreadExtendedData }
  | { type: 'THREAD_CREATED', id: EARS.EntityId, shortCode: string, entityType: EARS.Entity, timestamp: number, topic?: string, instructions?: string, status?: string }
  | { type: 'THREAD_UPDATED', threadId: string, updates: Partial<Pick<ThreadEntity, 'status' | 'tags'>> }
  | { type: 'THREAD_DELETED', threadId: string }
  | { type: 'THREADS_EXPORTED'; filePath: string; threadCount: number }
  | { type: 'THREADS_EXPORT_FAILED'; errors: string[] }
  | { type: 'THREADS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'THREADS_IMPORT_FAILED'; errors: string[] }
  // Chat/agent events (merged from agent system)
  | { type: 'AGENT_CONNECTED'; data: AgentConnectedData }
  | { type: 'LOAD_CHAT_THREAD', data: AgentThreadData }
  | { type: 'REFRESH_RECENT_THREADS'; data: RecentThreadRefreshData }
  | { type: 'ARTIFACT_ADDED'; tabId: string; artifact: any }
  | { type: 'THREAD_TAB_REQUESTED'; threadId: string; topic: string; artifacts: any[]; pinned?: boolean }
  | { type: 'AGENT_SETTINGS_UPDATED'; settings: AgentSettings }
  | { type: 'API_KEYS_STATUS'; hasRequiredApiKeys: boolean }
  | { type: 'UPDATE_MESSAGE_STATE'; messageId: string; text?: string; blocks?: BlockConfig[]; responseTimestamp?: number; blockResponse?: any }
  | { type: 'MESSAGE_ADDED'; threadId: string; message: MessageEntity }
  | { type: 'UPDATE_TODO_TASK'; artifactId: string; taskId: string; completed: boolean }
  | { type: 'SET_MODE'; mode: string }
  | { type: 'COMMANDS_UPDATED'; commands: CommandItem[] }

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
    // ---- Thread management actions ----
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

      const { id: newThreadId, ...rest } = repository.threadCommands.create({
        topic: thread.topic,
        instructions: thread.instructions,
        tags: thread.tags as string[],
        linkedThreads: thread.linkedThreads as ThreadLinkItem[],
      });

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
        entityType: EARS.Entity.Thread,
        ...rest
      }));
    },
    sendViewData: ({ system, event }) => {
      const threadId = typeOf('VIEW_THREAD', event).threadId as EARS.EntityId;

      repository.threadCommands.markAsVisited(threadId);

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

      if (key === 'status') {
        system.get(bus).send(emit(threads, {
          type: 'THREAD_UPDATED',
          threadId,
          updates: { status: value as string },
        }));
      }
    },
    updateThreadStatus: ({ system, event }) => {
      const { threadId, status } = typeOf('UPDATE_THREAD_STATUS', event);
      const updates = { status, updatedAt: Date.now() };
      repository.threadCommands.update(threadId as EARS.EntityId, updates);

      system.get(bus).send(emit(threads, {
        type: 'THREAD_UPDATED',
        threadId,
        updates: { status },
      }));
    },
    handleSettingsUpdate: ({ system, event }) => {
      const firstStatusLabel = (): string | undefined =>
        repository.settingsQueries.getPluginSettings('threads')?.statuses?.[0]?.label;

      const { changes } = typeOf('THREADS_SETTINGS_UPDATED', event);
      if (!changes) return;

      const busSvc = system.get(bus);

      const sBlock = (changes.statuses || changes) as ChangeBlock | undefined;
      const sRenames = toMap(sBlock?.renames);
      const sRemoved = toIdentifierSet(sBlock?.removed, (item: any) => item.label);
      const statusNeedsWork = sRenames.size || sRemoved.size;

      const statusFallback = () => firstStatusLabel();

      const tBlock = changes.tags as ChangeBlock | undefined;
      const tRenames = toMap(tBlock?.renames);
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
    },
    deleteThread: ({ system, event }) => {
      const { threadId } = typeOf('DELETE_THREAD', event);

      repository.threadCommands.delete(threadId as EARS.EntityId);

      system.get(bus).send(emit(threads, {
        type: 'THREAD_DELETED',
        threadId,
      }));

      // Refresh recent threads since active thread may have been deleted
      services.chat.sendRecentThreadsRefresh();
    },
    exportThreadsToFile: ({ system, event }) => {
      const ev = event as { type: 'EXPORT_THREADS'; directory: string };

      try {
        const { filePath, threadCount } = exportThreads(ev.directory);

        system.get(bus).send(emit(threads, {
          type: 'THREADS_EXPORTED',
          filePath,
          threadCount,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit(threads, {
          type: 'THREADS_EXPORT_FAILED',
          errors: [message],
        }));
      }
    },
    importThreadItems: ({ system, event }) => {
      const ev = event as { type: 'IMPORT_THREADS'; directory: string };

      try {
        const result = importThreads(ev.directory);

        if (result.created === 0 && result.errors.length > 0) {
          system.get(bus).send(emit(threads, {
            type: 'THREADS_IMPORT_FAILED',
            errors: result.errors,
          }));
          return;
        }

        system.get(bus).send(emit(threads, {
          type: 'THREADS_IMPORTED',
          count: result.created,
          ...(result.errors.length > 0 ? { errors: result.errors } : {}),
        }));

        const connectedData = repository.threadQueries.connectedData();
        const threadsSettings = repository.settingsQueries.getPluginSettings('threads');

        system.get(bus).send(emit(threads, {
          type: 'THREAD_CONNECTED',
          data: {
            ...connectedData,
            settings: threadsSettings || null,
          },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit(threads, {
          type: 'THREADS_IMPORT_FAILED',
          errors: [message],
        }));
      }
    },

    // ---- Chat/agent actions (merged from agent system) ----
    startBirthFlow: ({ system }) => {
      const assistantSettings = repository.settingsQueries.getAssistantSettings();

      if (!assistantSettings.birthdate) {
        const birthdate = new Date().toISOString();
        repository.settingsCommands.updateSettings('assistant', null, ['birthdate'], birthdate);
        logger.info('Assistant birthdate set', { birthdate });
      }

      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'tour.complete',
        payload: {},
      });
    },
    sendChatConnectedData: async ({ system }) => {
      const data = repository.chatQueries.connectedData();

      let commands: CommandItem[] = [];
      try {
        const doc = await services.library.getByPath(['internal'], 'commands');
        if (doc) {
          const fieldSection = doc.content.find((s): s is FieldContent => s.type === 'field');
          if (fieldSection) {
            commands = fieldSection.fields.map(f => ({ name: f.key, placeholder: f.value }));
          }
        }
      } catch {
        // Gracefully return empty commands if document doesn't exist
      }

      system.get(bus).send(emit(threads, {
        type: 'AGENT_CONNECTED',
        data: { ...data, commands },
      }));
    },
    sendApiKeyStatus: ({ system }) => {
      const hasRequiredApiKeys = repository.chatQueries.hasRequiredApiKeys();
      system.get(bus).send(emit(threads, {
        type: 'API_KEYS_STATUS',
        hasRequiredApiKeys
      }));
    },
    sendThreadChatData: ({ system, event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId as EARS.EntityId;
      services.chat.openThreadChatAndRefreshRecent(threadId);
    },
    sendThreadTabData: ({ system, event }) => {
      const { threadId } = typeOf('OPEN_THREAD_TAB', event);
      services.chat.openThreadTabAndRefresh(threadId as EARS.EntityId);
    },
    forwardUserMessage: ({ system, event }) => {
      const { text, mode, phase, threadId: providedThreadId, references } = typeOf('USER_MSG', event);

      const sanitizedRefs = references ? {
        ...references,
        ...(references.files && {
          files: references.files.map(({ previewUrl, ...rest }: any) => rest),
        }),
      } : undefined;

      let threadId: EARS.EntityId;
      let threadData: any = null;

      if (!providedThreadId) {
        const result = repository.chatCommands.createThreadFromMessage(text);
        threadId = result.threadId;
        threadData = result.threadData;

        logger.info('Created new thread for user message', {
          threadId,
          shortCode: result.threadData.shortCode,
        });

        repository.threadCommands.markAsVisited(threadId);
      } else {
        threadId = providedThreadId as EARS.EntityId;
      }

      const messageResult = repository.chatCommands.addMessage({
        threadId,
        text,
        sender: 'user',
        references: sanitizedRefs,
      });

      if (threadData) {
        const fullThreadData = repository.threadQueries.byId(threadData.id);

        system.get(bus).send(emit(threads, {
          type: 'THREAD_CREATED',
          id: threadData.id,
          shortCode: threadData.shortCode,
          entityType: EARS.Entity.Thread,
          timestamp: threadData.timestamp,
          topic: fullThreadData?.topic,
          instructions: fullThreadData?.instructions,
          status: fullThreadData?.status
        } as any));

        system.get(bus).send(emit(threads, {
          type: 'LOAD_CHAT_THREAD',
          data: threadData
        }));
      } else {
        const userMessage: MessageEntity = {
          id: messageResult.id,
          entityType: EARS.Entity.Message,
          text: messageResult.text,
          sender: messageResult.sender as 'user' | 'assistant' | 'system',
          timestamp: messageResult.timestamp,
          createdAt: messageResult.timestamp,
          updatedAt: messageResult.timestamp,
          ...(sanitizedRefs && { references: sanitizedRefs }),
        };

        system.get(bus).send(emit(threads, {
          type: 'MESSAGE_ADDED',
          threadId: threadId as string,
          message: userMessage
        }));
      }

      services.chat.sendRecentThreadsRefresh();

      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'user.message',
        payload: {
          text,
          mode,
          phase,
          threadId,
          messageId: messageResult.id,
          ...(sanitizedRefs && { references: sanitizedRefs }),
        },
      });
    },
    forwardUserCommand: ({ system, event }) => {
      const { command, text, mode, phase, threadId: providedThreadId, references } = typeOf('USER_COMMAND', event);

      const sanitizedRefs = references ? {
        ...references,
        ...(references.files && {
          files: references.files.map(({ previewUrl, ...rest }: any) => rest),
        }),
      } : undefined;

      let threadId: EARS.EntityId;
      let threadData: any = null;

      if (!providedThreadId) {
        const result = repository.chatCommands.createThreadFromMessage(text || `/${command}`);
        threadId = result.threadId;
        threadData = result.threadData;

        logger.info('Created new thread for user command', {
          threadId,
          command,
          shortCode: result.threadData.shortCode,
        });

        repository.threadCommands.markAsVisited(threadId);
      } else {
        threadId = providedThreadId as EARS.EntityId;
      }

      const messageResult = repository.chatCommands.addMessage({
        threadId,
        text: text ? `/${command} ${text}` : `/${command}`,
        sender: 'user',
        references: sanitizedRefs,
        isCommand: true,
        command,
      });

      if (threadData) {
        const fullThreadData = repository.threadQueries.byId(threadData.id);

        system.get(bus).send(emit(threads, {
          type: 'THREAD_CREATED',
          id: threadData.id,
          shortCode: threadData.shortCode,
          entityType: EARS.Entity.Thread,
          timestamp: threadData.timestamp,
          topic: fullThreadData?.topic,
          instructions: fullThreadData?.instructions,
          status: fullThreadData?.status
        } as any));

        system.get(bus).send(emit(threads, {
          type: 'LOAD_CHAT_THREAD',
          data: threadData
        }));
      } else {
        const userMessage: MessageEntity = {
          id: messageResult.id,
          entityType: EARS.Entity.Message,
          text: messageResult.text,
          sender: messageResult.sender as 'user' | 'assistant' | 'system',
          timestamp: messageResult.timestamp,
          createdAt: messageResult.timestamp,
          updatedAt: messageResult.timestamp,
          ...(sanitizedRefs && { references: sanitizedRefs }),
          isCommand: true,
          command,
        };

        system.get(bus).send(emit(threads, {
          type: 'MESSAGE_ADDED',
          threadId: threadId as string,
          message: userMessage
        }));
      }

      services.chat.sendRecentThreadsRefresh();

      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'user.command',
        payload: {
          command,
          text,
          mode,
          phase,
          threadId,
          messageId: messageResult.id,
          ...(sanitizedRefs && { references: sanitizedRefs }),
        },
      });
    },
    forkThread: ({ system, event }) => {
      const { messageId, threadId, threadTopic } = typeOf('FORK_THREAD', event);
      const originalTopic = threadTopic || 'Untitled';

      const forkCount = repository.threadCommands.forkCount(threadId as EARS.EntityId);
      const forkTopic = `Fork ${forkCount + 1} - ${originalTopic}`;

      const result = services.chat.createThreadAndNotify({ topic: forkTopic, instructions: '' });

      repository.threadCommands.linkFork(threadId as EARS.EntityId, result.id);

      if (threadId) {
        repository.chatCommands.copyMessagesUpTo({
          sourceThreadId: threadId as EARS.EntityId,
          targetThreadId: result.id,
          upToMessageId: messageId,
        });
      }

      services.chat.openThreadChatAndRefreshRecent(result.id);

      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'thread.fork',
        payload: {
          sourceThreadId: threadId,
          sourceMessageId: messageId,
          newThreadId: result.id,
        },
      });
    },
    revertThread: ({ system, event }) => {
      const { messageId, threadId } = typeOf('REVERT_THREAD', event);

      repository.chatCommands.softDeleteMessagesAfter({
        threadId: threadId as EARS.EntityId,
        messageId: messageId as EARS.EntityId,
      });

      services.chat.openThreadChatAndRefreshRecent(threadId as EARS.EntityId);

      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'thread.revert',
        payload: { threadId, messageId },
      });
    },
    forwardInteractiveMessageResponse: ({ system, event }) => {
      const { messageId, threadId, response } = typeOf('INTERACTIVE_MSG_RESPONSE', event);

      const result = repository.chatCommands.updateMessageBlockResponse({
        messageId: messageId as EARS.EntityId,
        response
      });

      getActor(system, brain).send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'interactive.message.response',
        payload: { messageId, threadId, response }
      });

      system.get(bus).send(emit(threads, {
        type: 'UPDATE_MESSAGE_STATE',
        messageId,
        responseTimestamp: result.responseTimestamp,
        blockResponse: response,
        ...(result.blocks && { blocks: result.blocks })
      }));
    }
  },
}).createMachine(
  {
    id: threads,
    initial: 'idle',
    context: ({ input }) => ({}),
    on: {
      CLIENT_CONNECTED: {
        actions: ['sendThreadsConnectedData', 'sendChatConnectedData'],
      },
      THREADS_SETTINGS_UPDATED: {
        actions: 'handleSettingsUpdate',
      },
      // Chat/agent global events
      OPEN_THREAD_CHAT: {
        actions: 'sendThreadChatData',
      },
      OPEN_THREAD_TAB: {
        actions: 'sendThreadTabData',
      },
      API_KEYS_CHANGED: {
        actions: 'sendApiKeyStatus',
      },
      BIRTH_FLOW_START: {
        actions: 'startBirthFlow',
      },
      THREAD_DELETED: {
        // Internal notification (e.g., refresh chat if active thread deleted)
      },
    },
    states: {
      idle: {
        on: {
          // Thread management
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
          DELETE_THREAD: {
            actions: 'deleteThread',
          },
          EXPORT_THREADS: {
            actions: 'exportThreadsToFile',
          },
          IMPORT_THREADS: {
            actions: 'importThreadItems',
          },
          // Chat/agent events
          USER_MSG: {
            actions: 'forwardUserMessage',
          },
          INTERACTIVE_MSG_RESPONSE: {
            actions: 'forwardInteractiveMessageResponse',
          },
          USER_COMMAND: {
            actions: 'forwardUserCommand',
          },
          FORK_THREAD: {
            actions: 'forkThread',
          },
          REVERT_THREAD: {
            actions: 'revertThread',
          },
        },
      },
    },
  }
);
