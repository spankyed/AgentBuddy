import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { bus } from '@/systems/backend';
import { emit, getActor, sendParentSafe } from '@/core/helpers/actor-helpers';
import { EARS } from '@/core/types';
import { repository } from '@/repository';
import { tx } from '@/core/ears/helpers/transaction';
import type { ThreadEditFields, ThreadEntity, ThreadLinkItem, ThreadConnectedData, MessageEntity, BlockConfig, AgentThreadData, AgentConnectedData, AgentSettings, RecentThreadRefreshData, CommandItem } from '@/types';
import { type ThreadExtendedData, type BlockResponse } from './types';
import { type ChangeBlock, toMap, toIdentifierSet, mapScalar, mapArray } from '@/systems/settings/settings-changes';
import { exportThreads } from './export-threads';
import { importThreads } from './import-threads';
import { brain } from '../brain/system';
import services from '@/services';
import { generateAsideText } from '@/services/chat';
import { createLogger } from '@/core/helpers/debug/logger';
import type { FieldContent } from '@/systems/library/types';

const logger = createLogger('threads');

type IncomingThreadsEvents =
  // Thread management events
  | { type: 'CREATE_THREAD'; topic: string; tags?: string[]; instructions: string; linkedThreads?: { id: string; relation: 'parent_of' | 'blocks' | 'blocked_by' | 'duplicates' }[]; parentThreadId?: string }
  | { type: 'VIEW_THREAD'; threadId: string }
  | { type: 'UPDATE_THREAD_STATUS'; threadId: string; status: string }
  | { type: 'UPDATE_THREAD_FIELD'; threadId: string; key: string; value: any }
  | { type: 'DELETE_THREAD'; threadId: string }
  | { type: 'SET_THREAD_PARENT'; childIds: string[]; parentId: string }
  | { type: 'EXPORT_THREADS'; directory: string }
  | { type: 'IMPORT_THREADS'; directory: string }
  // Chat/agent events (merged from agent system)
  | { type: 'USER_MSG'; text: string; mode?: string; phase?: string; threadId?: string; references?: { images?: { url: string; name: string }[]; files?: { name: string; path: string; typeLabel: string; isImage: boolean }[]; context?: { refType: 'thread' | 'document' | 'note' | 'task' | 'tasklist' | 'folder'; refId: string; shortCode: string; label: string }[] }; cwdOverride?: string; forceDirectoryPicker?: boolean }
  | { type: 'OPEN_THREAD_CHAT'; threadId: string; restore?: boolean }
  | { type: 'OPEN_THREAD_TAB'; threadId: string; label: string; pinned?: boolean }
  | { type: 'PAUSE_TURN'; threadId: string }
  | { type: 'APPROVE_TODO_LIST'; artifactId: string; tasks: any[] }
  | { type: 'REJECT_TODO_LIST'; artifactId: string }
  | { type: 'INTERACTIVE_MSG_RESPONSE'; messageId: string; threadId: string; response: any }
  | { type: 'FORK_THREAD'; messageId: string; threadId?: string; threadTopic?: string }
  | { type: 'REVERT_THREAD'; messageId: string; threadId: string; restoreFiles?: boolean; userCliUuid?: string }
  | { type: 'SUMMARIZE_THREAD'; messageId: string; threadId: string }
  | { type: 'USER_COMMAND'; command: string; text: string; mode?: string; phase?: string; threadId?: string; references?: { images?: { url: string; name: string }[]; files?: { name: string; path: string; typeLabel: string; isImage: boolean }[]; context?: { refType: 'thread' | 'document' | 'note' | 'task' | 'tasklist' | 'folder'; refId: string; shortCode: string; label: string }[] } }
  | { type: 'TOGGLE_COMPACTED'; markerId: string; compacted: boolean }
  | { type: 'DELETE_MESSAGE'; messageId: string }
  | { type: 'FORWARD_BRAIN_EVENT'; eventType: string; payload?: any }
  | { type: 'GET_ARCHIVED_THREADS' }
  | { type: 'REFRESH_THREADS' }

export type ThreadsInternalEvents =
  | { type: 'CLIENT_CONNECTED' }
  | { type: 'THREADS_SETTINGS_UPDATED'; settings: any; changes?: any }
  | { type: 'API_KEYS_CHANGED' }
  | { type: 'BIRTH_FLOW_START' }
  | { type: 'THREAD_DELETED'; threadId: string }

export type OutgoingThreadsEvents =
  // Thread management events
  | { type: 'THREAD_CONNECTED'; data: ThreadConnectedData }
  | { type: 'SET_VIEW_DATA', id: EARS.EntityId, data: ThreadExtendedData }
  | { type: 'THREAD_CREATED', id: EARS.EntityId, shortCode: string, entityType: EARS.Entity, timestamp: number, topic?: string, instructions?: string, status?: string }
  | { type: 'THREAD_UPDATED', threadId: string, updates: Partial<Pick<ThreadEntity, 'status' | 'tags' | 'context' | 'pinned' | 'topic' | 'instructions'>> }
  | { type: 'THREAD_DELETED', threadId: string }
  | { type: 'THREADS_EXPORTED'; filePath: string; threadCount: number }
  | { type: 'THREADS_EXPORT_FAILED'; errors: string[] }
  | { type: 'THREADS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'THREADS_IMPORT_FAILED'; errors: string[] }
  | { type: 'ARCHIVED_THREADS_DATA'; threads: Partial<ThreadEntity>[] }
  // Chat/agent events (merged from agent system)
  | { type: 'AGENT_CONNECTED'; data: AgentConnectedData }
  | { type: 'LOAD_CHAT_THREAD', data: AgentThreadData, restore?: boolean }
  | { type: 'REFRESH_RECENT_THREADS'; data: RecentThreadRefreshData }
  | { type: 'ARTIFACT_ADDED'; tabId: string; artifact: any }
  | { type: 'ARTIFACT_UPDATED'; tabId: string; artifact: any }
  | { type: 'THREAD_TAB_REQUESTED'; threadId: string; topic: string; artifacts: any[]; pinned?: boolean }
  | { type: 'AGENT_SETTINGS_UPDATED'; settings: AgentSettings }
  | { type: 'API_KEYS_STATUS'; hasRequiredApiKeys: boolean }
  | { type: 'UPDATE_MESSAGE_STATE'; messageId: string; text?: string; blocks?: BlockConfig[]; responseTimestamp?: number; blockResponse?: BlockResponse; forkable?: boolean; status?: 'queued' | 'cancelled' | null; context?: Record<string, unknown>; asideText?: string; asideContext?: string; compacted?: boolean }
  | { type: 'MESSAGE_ADDED'; threadId: string; message: MessageEntity }
  | { type: 'UPDATE_TODO_TASK'; artifactId: string; taskId: string; completed: boolean }
  | { type: 'SET_MODE'; mode: string }
  | { type: 'SET_PHASE'; phase: string }
  | { type: 'SET_CHAT_STATE'; threadId: string; chatState: string }
  | { type: 'FLASH_CHAT_STATE'; threadId: string; stateId: string; durationMs?: number }
  | { type: 'COMMANDS_UPDATED'; commands: CommandItem[] }
  | { type: 'THREAD_CHAT_ERROR'; threadId: string; error: string }

export interface ThreadsContext {}

export const threadsDef = defineSystem('threads')<IncomingThreadsEvents | ThreadsInternalEvents, OutgoingThreadsEvents, ThreadsContext>();
export const threads = threadsDef.id;

export const threadsSystem = setup({
  types: threadsDef.types,
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
    sendArchivedThreads: ({ system }) => {
      system.get(bus).send(emit(threads, {
        type: 'ARCHIVED_THREADS_DATA',
        threads: repository.threadQueries.archivedThreads(),
      }));
    },
    createThread: ({ system, event }) => {
      const thread = threadsDef.typeOf('CREATE_THREAD', event);

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
      const threadId = threadsDef.typeOf('VIEW_THREAD', event).threadId as EARS.EntityId;

      repository.threadCommands.markAsVisited(threadId);

      system.get(bus).send(emit(threads, {
        type: 'SET_VIEW_DATA',
        id: threadId,
        data: repository.threadQueries.extendedData(threadId),
      }));
    },
    updateThreadField: ({ system, event }) => {
      const { key, value, threadId } = threadsDef.typeOf('UPDATE_THREAD_FIELD', event);
      const updates = { [key]: value };
      repository.threadCommands.update(threadId as EARS.EntityId, updates);

      if (key === 'status') {
        system.get(bus).send(emit(threads, {
          type: 'THREAD_UPDATED',
          threadId,
          updates: { status: value as string },
        }));
      }

      if (key === 'archived') {
        // Refresh thread list and recent threads since thread visibility changed
        system.get(bus).send(emit(threads, {
          type: 'THREAD_CONNECTED',
          data: {
            ...repository.threadQueries.connectedData(),
            settings: repository.settingsQueries.getPluginSettings('threads') ?? null,
          },
        }));
        services.chat.sendRecentThreadsRefresh();
      }

      if (key === 'pinned') {
        system.get(bus).send(emit(threads, {
          type: 'THREAD_UPDATED',
          threadId,
          updates: { pinned: value as boolean },
        }));
        services.chat.sendRecentThreadsRefresh();
      }

      if (key === 'topic') {
        services.chat.sendRecentThreadsRefresh();
      }
    },
    updateThreadStatus: ({ system, event }) => {
      const { threadId, status } = threadsDef.typeOf('UPDATE_THREAD_STATUS', event);
      const updates = { status, updatedAt: Date.now() };
      repository.threadCommands.update(threadId as EARS.EntityId, updates);

      system.get(bus).send(emit(threads, {
        type: 'THREAD_UPDATED',
        threadId,
        updates: { status },
      }));

      // Notify flows — all logic lives in the flow layer
      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'thread.status.changed',
        payload: { threadId, status, userInduced: true },
      });
    },
    handleSettingsUpdate: ({ system, event }) => {
      const firstStatusLabel = (): string | undefined =>
        repository.settingsQueries.getPluginSettings('threads')?.statuses?.[0]?.label;

      const { changes } = threadsDef.typeOf('THREADS_SETTINGS_UPDATED', event);

      const busSvc = system.get(bus);

      if (changes) {
        const sBlock = (changes.statuses || changes) as ChangeBlock | undefined;
        const sRenames = toMap(sBlock?.renames);
        const sRemoved = toIdentifierSet(sBlock?.removed, (item: any) => item.label);
        const statusNeedsWork = sRenames.size || sRemoved.size;

        const statusFallback = () => firstStatusLabel();

        const tBlock = changes.tags as ChangeBlock | undefined;
        const tRenames = toMap(tBlock?.renames);
        const tRemoved = toIdentifierSet(tBlock?.removed, (item: any) => item.name);
        const tagNeedsWork = tRenames.size || tRemoved.size;

        if (statusNeedsWork || tagNeedsWork) {
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
        }
      }

      // Always refresh recent threads — sort order or limit may have changed
      services.chat.sendRecentThreadsRefresh();
    },
    setThreadParent: ({ system, event }) => {
      const { childIds, parentId } = threadsDef.typeOf('SET_THREAD_PARENT', event);

      repository.threadCommands.setParent(
        parentId as EARS.EntityId,
        childIds.map(id => id as EARS.EntityId),
      );

      // Refresh all thread data on the frontend
      system.get(bus).send(emit(threads, {
        type: 'THREAD_CONNECTED',
        data: {
          ...repository.threadQueries.connectedData(),
          settings: repository.settingsQueries.getPluginSettings('threads') ?? null,
        },
      }));
    },
    deleteThread: ({ system, event }) => {
      const { threadId } = threadsDef.typeOf('DELETE_THREAD', event);

      // Stop active processes before hard-deleting the thread.
      services.threads.runCleanup(threadId);

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
        eventType: 'onboarding.start',
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
      const { threadId, restore } = threadsDef.typeOf('OPEN_THREAD_CHAT', event);
      try {
        services.chat.openThreadChatAndRefreshRecent(threadId as EARS.EntityId, restore);
      } catch (err) {
        logger.warn('Thread not found for chat open, skipping', { threadId });
        system.get(bus).send(emit(threads, {
          type: 'THREAD_CHAT_ERROR',
          threadId: threadId as string,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    sendThreadTabData: ({ system, event }) => {
      const { threadId } = threadsDef.typeOf('OPEN_THREAD_TAB', event);
      try {
        services.chat.openThreadTabAndRefresh(threadId as EARS.EntityId);
      } catch (err) {
        logger.warn('Thread not found for tab open, skipping', { threadId });
        system.get(bus).send(emit(threads, {
          type: 'THREAD_CHAT_ERROR',
          threadId: threadId as string,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    forwardUserMessage: ({ system, event }) => {
      const { text, mode, phase, threadId: providedThreadId, references, cwdOverride, forceDirectoryPicker } = threadsDef.typeOf('USER_MSG', event);

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
          data: repository.chatQueries.threadData(threadId)
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
          ...(cwdOverride && { cwdOverride }),
          ...(forceDirectoryPicker && { forceDirectoryPicker }),
        },
      });
    },
    forwardUserCommand: ({ system, event }) => {
      const { command, text, mode, phase, threadId: providedThreadId, references } = threadsDef.typeOf('USER_COMMAND', event);

      const sanitizedRefs = references ? {
        ...references,
        ...(references.files && {
          files: references.files.map(({ previewUrl, ...rest }: any) => rest),
        }),
      } : undefined;

      let threadId: EARS.EntityId;
      let threadData: any = null;

      if (!providedThreadId) {
        const topicText = text ? `/${command} ${text}` : `/${command}`;
        const result = repository.chatCommands.createThreadFromMessage(topicText);
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
          data: repository.chatQueries.threadData(threadId)
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
      const { messageId, threadId, threadTopic } = threadsDef.typeOf('FORK_THREAD', event);
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
      const { messageId, threadId, restoreFiles, userCliUuid } = threadsDef.typeOf('REVERT_THREAD', event);

      // Stop active processes before soft-deleting so nothing races
      // against the deletion (e.g. a stream consumer writing to messages).
      services.threads.runCleanup(threadId);

      repository.chatCommands.softDeleteMessagesAfter({
        threadId: threadId as EARS.EntityId,
        messageId: messageId as EARS.EntityId,
      });

      services.chat.openThreadChatAndRefreshRecent(threadId as EARS.EntityId);

      // Unified `thread.revert` brain event — the `kind` discriminator
      // tells the claude-code flow which variant to run.
      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'thread.revert',
        payload: {
          threadId,
          messageId,
          kind: restoreFiles ? 'rewind' : 'revert',
          ...(restoreFiles && userCliUuid ? { userCliUuid } : {}),
        },
      });
    },
    summarizeThread: ({ system, event }) => {
      const { messageId, threadId } = threadsDef.typeOf('SUMMARIZE_THREAD', event);

      // Stop active processes before soft-deleting (same as revert).
      services.threads.runCleanup(threadId);

      // Matches Claude Code's native `direction: 'from'` — the pivot and
      // everything after it disappear from the visible transcript, then a
      // synthetic `/compact` turn runs against the truncated session.
      repository.chatCommands.softDeleteMessagesAfter({
        threadId: threadId as EARS.EntityId,
        messageId: messageId as EARS.EntityId,
      });

      services.chat.openThreadChatAndRefreshRecent(threadId as EARS.EntityId);

      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'thread.revert',
        payload: { threadId, messageId, kind: 'summarize' },
      });
    },
    pauseTurn: ({ system, event }) => {
      const { threadId } = threadsDef.typeOf('PAUSE_TURN', event);
      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'user.thread.pause',
        payload: { threadId },
      });
    },
    forwardBrainEvent: ({ system, event }) => {
      const { eventType, payload } = threadsDef.typeOf('FORWARD_BRAIN_EVENT', event);
      const brainActor = getActor(system, brain);
      brainActor.send({ type: 'TRIGGER_BRAIN_EVENT', eventType, payload });
    },
    forwardInteractiveMessageResponse: ({ system, event }) => {
      const { messageId, threadId, response } = threadsDef.typeOf('INTERACTIVE_MSG_RESPONSE', event);

      const result = repository.chatCommands.updateMessageBlockResponse({
        messageId: messageId as EARS.EntityId,
        response
      });

      // Compute aside text for autoHide messages
      let asideText: string | undefined;
      const message = repository.chatQueries.messageById(messageId as EARS.EntityId);
      if (message?.autoHide) {
        asideText = generateAsideText(message, response);
        tx(messageId as EARS.EntityId).put('asideText', asideText);
      }

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
        ...(result.blocks && { blocks: result.blocks }),
        ...(asideText && { asideText })
      }));
    },
    deleteMessage: ({ event }) => {
      const { messageId } = threadsDef.typeOf('DELETE_MESSAGE', event);
      if (!repository.chatQueries.messageById(messageId as EARS.EntityId)) return;
      tx(messageId as EARS.EntityId).destroy();
    },
    toggleCompacted: ({ system, event }) => {
      const { markerId, compacted } = threadsDef.typeOf('TOGGLE_COMPACTED', event);
      const messageIds = repository.chatCommands.toggleMarkerCompacted(
        markerId as EARS.EntityId,
        compacted,
      );
      for (const msgId of messageIds) {
        system.get(bus).send(emit(threads, {
          type: 'UPDATE_MESSAGE_STATE',
          messageId: msgId as string,
          compacted,
        }));
      }
    },
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
          SET_THREAD_PARENT: {
            actions: 'setThreadParent',
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
          SUMMARIZE_THREAD: {
            actions: 'summarizeThread',
          },
          TOGGLE_COMPACTED: {
            actions: 'toggleCompacted',
          },
          DELETE_MESSAGE: {
            actions: 'deleteMessage',
          },
          PAUSE_TURN: {
            actions: 'pauseTurn',
          },
          FORWARD_BRAIN_EVENT: {
            actions: 'forwardBrainEvent',
          },
          GET_ARCHIVED_THREADS: {
            actions: 'sendArchivedThreads',
          },
          REFRESH_THREADS: {
            actions: 'sendThreadsConnectedData',
          },
        },
      },
    },
  }
);
