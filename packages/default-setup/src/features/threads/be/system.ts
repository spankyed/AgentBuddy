import type { ThreadsSettings } from '@/__generated__/types'
import type { AssistantSettings } from '@/app-settings/types';
import { sendToSystem, broadcastToPlugin } from '@/__generated__/events';
import { services } from '@/__generated__/services';
import { REQUIRED_PROVIDERS } from '@/app-settings/providers';
import { assign, setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';

import { tx, EARS } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import type { Contract } from './contract';
import type { MessageEntity, ThreadLinkItem } from './types';
import { type ChangeBlock, toMap, toIdentifierSet, mapScalar, mapArray } from '@abuddy/sdk/utils';
import { exportThreads } from './export-threads';
import { importThreads } from './import-threads';
import { runThreadTeardown } from './thread-teardown';
import { generateAsideText } from './services/chat';
import { createLogger, reportError } from '@abuddy/sdk/logger';
import { ref } from '@/__generated__/ref';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const logger = createLogger('threads');
let birthFlowStarted = false;


export const threadsSpec = defineSystem<Contract>();

function reportThreadOperationError(
  operation: 'create' | 'update' | 'delete' | 'archive' | 'unarchive' | 'pin' | 'unpin' | 'status' | 'parent',
  error: unknown,
  threadId?: string,
) {
  const operationLabels: Record<typeof operation, string> = {
    create: 'create',
    update: 'update',
    delete: 'delete',
    archive: 'archive',
    unarchive: 'unarchive',
    pin: 'pin',
    unpin: 'unpin',
    status: 'update status for',
    parent: 'move',
  };

  reportError({
    error,
    title: `Could not ${operationLabels[operation]} thread`,
    source: 'threads',
    operation,
    entityId: threadId,
  });
}

export const threadsSystem = setup({
  types: threadsSpec.types,
  actions: {
    // ---- Thread management actions ----
    sendThreadsConnectedData: () => {
      const connectedData = repository.threadQueries.connectedData();
      const threadsSettings = services.settings.forFeature<ThreadsSettings>(ref('threads'));

      broadcastToPlugin('threads', {
        type: 'THREAD_CONNECTED',
        data: {
          ...connectedData,
          settings: threadsSettings || null
        }
      });
    },
    sendArchivedThreads: () => {
      broadcastToPlugin('threads', {
        type: 'ARCHIVED_THREADS_DATA',
        threads: repository.threadQueries.archivedThreads(),
      });
    },
    createThread: ({ event }) => {
      const thread = threadsSpec.typeOf('CREATE_THREAD', event);

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

      broadcastToPlugin('threads', {
        type: 'THREAD_CREATED',
        id: newThreadId,
        entityType: EARS.Entity.Thread,
        ...rest
      });
    },
    sendViewData: ({ event }) => {
      const threadId = threadsSpec.typeOf('VIEW_THREAD', event).threadId as EARS.EntityId;

      repository.threadCommands.markAsVisited(threadId);

      broadcastToPlugin('threads', {
        type: 'SET_VIEW_DATA',
        id: threadId,
        data: repository.threadQueries.extendedData(threadId),
      });
    },
    updateThreadField: ({ event }) => {
      const { key, value, threadId } = threadsSpec.typeOf('UPDATE_THREAD_FIELD', event);
      const updates = { [key]: value };
      try {
        repository.threadCommands.update(threadId as EARS.EntityId, updates);
      } catch (error) {
        const operation =
          key === 'archived' ? (value ? 'archive' : 'unarchive') :
          key === 'pinned' ? (value ? 'pin' : 'unpin') :
          'update';
        logger.warn('Failed to update thread field', { threadId, key, error });
        reportThreadOperationError(operation, error, threadId);
        return;
      }

      if (key === 'status') {
        broadcastToPlugin('threads', {
          type: 'THREAD_UPDATED',
          threadId,
          updates: { status: value as string },
        });
      }

      if (key === 'archived') {
        // Refresh thread list and recent threads since thread visibility changed
        broadcastToPlugin('threads', {
          type: 'THREAD_CONNECTED',
          data: {
            ...repository.threadQueries.connectedData(),
            settings: services.settings.forFeature<ThreadsSettings>(ref('threads')) ?? null,
          },
        });
        // Also refresh archived threads list so the change is visible immediately
        broadcastToPlugin('threads', {
          type: 'ARCHIVED_THREADS_DATA',
          threads: repository.threadQueries.archivedThreads(),
        });
        services.chat.sendRecentThreadsRefresh();
      }

      if (key === 'pinned') {
        broadcastToPlugin('threads', {
          type: 'THREAD_UPDATED',
          threadId,
          updates: { pinned: value as boolean },
        });
        services.chat.sendRecentThreadsRefresh();
      }

      if (key === 'topic') {
        services.chat.sendRecentThreadsRefresh();
      }
    },
    updateThreadStatus: ({ event }) => {
      const { threadId, status } = threadsSpec.typeOf('UPDATE_THREAD_STATUS', event);
      const updates = { status, updatedAt: Date.now() };
      try {
        repository.threadCommands.update(threadId as EARS.EntityId, updates);
      } catch (error) {
        logger.warn('Failed to update thread status', { threadId, status, error });
        reportThreadOperationError('status', error, threadId);
        return;
      }

      broadcastToPlugin('threads', {
        type: 'THREAD_UPDATED',
        threadId,
        updates: { status },
      });

      // Notify flows — all logic lives in the flow layer
      sendToSystem('brain', {
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'thread.status.changed',
        payload: { threadId, status, userInduced: true },
      });
    },
    handleSettingsUpdate: ({ event }) => {
      const firstStatusLabel = (): string | undefined =>
        services.settings.forFeature<ThreadsSettings>(ref('threads'))?.statuses?.[0]?.label;

      const { changes } = threadsSpec.typeOf('FEATURE_SETTINGS_UPDATED', event);


      if (changes) {
        const sBlock = changes.statuses as ChangeBlock | undefined;
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
              broadcastToPlugin('threads', { type: 'THREAD_UPDATED', threadId: th.id, updates: patch });
              touched = true;
            }
          }

          if (touched) {
            broadcastToPlugin('threads', {
                type: 'THREAD_CONNECTED',
                data: {
                  ...repository.threadQueries.connectedData(),
                  settings: services.settings.forFeature<ThreadsSettings>(ref('threads')) ?? null,
                },
              });
          }
        }
      }

      // Always refresh recent threads — sort order or limit may have changed
      services.chat.sendRecentThreadsRefresh();
    },
    setThreadParent: ({ event }) => {
      const { childIds, parentId } = threadsSpec.typeOf('SET_THREAD_PARENT', event);

      try {
        repository.threadCommands.setParent(
          parentId as EARS.EntityId,
          childIds.map(id => id as EARS.EntityId),
        );
      } catch (error) {
        logger.warn('Failed to set thread parent', { childIds, parentId, error });
        reportThreadOperationError('parent', error, parentId);
        return;
      }

      // Refresh all thread data on the frontend
      broadcastToPlugin('threads', {
        type: 'THREAD_CONNECTED',
        data: {
          ...repository.threadQueries.connectedData(),
          settings: services.settings.forFeature<ThreadsSettings>(ref('threads')) ?? null,
        },
      });
    },
    deleteThread: ({ event }) => {
      const { threadId } = threadsSpec.typeOf('DELETE_THREAD', event);

      // Stop active processes before hard-deleting the thread.
      runThreadTeardown(threadId);

      try {
        repository.threadCommands.delete(threadId as EARS.EntityId);
      } catch (error) {
        logger.warn('Failed to delete thread (may already be deleted)', { threadId, error });
        reportThreadOperationError('delete', error, threadId);
        return;
      }

      broadcastToPlugin('threads', {
        type: 'THREAD_DELETED',
        threadId,
      });

      // Refresh recent threads since active thread may have been deleted
      services.chat.sendRecentThreadsRefresh();
    },
    exportThreadsToFile: ({ event }) => {
      const ev = event as { type: 'EXPORT_THREADS'; directory: string };

      try {
        const { filePath, threadCount } = exportThreads(ev.directory);

        broadcastToPlugin('threads', {
          type: 'THREADS_EXPORTED',
          filePath,
          threadCount,
        });
      } catch (err) {
        const message = errorMessage(err);
        broadcastToPlugin('threads', {
          type: 'THREADS_EXPORT_FAILED',
          errors: [message],
        });
      }
    },
    importThreadItems: ({ event }) => {
      const ev = event as { type: 'IMPORT_THREADS'; directory: string };

      try {
        const result = importThreads(ev.directory);

        if (result.created === 0 && result.errors.length > 0) {
          broadcastToPlugin('threads', {
            type: 'THREADS_IMPORT_FAILED',
            errors: result.errors,
          });
          return;
        }

        broadcastToPlugin('threads', {
          type: 'THREADS_IMPORTED',
          count: result.created,
          ...(result.errors.length > 0 ? { errors: result.errors } : {}),
        });

        const connectedData = repository.threadQueries.connectedData();
        const threadsSettings = services.settings.forFeature<ThreadsSettings>(ref('threads'));

        broadcastToPlugin('threads', {
          type: 'THREAD_CONNECTED',
          data: {
            ...connectedData,
            settings: threadsSettings || null,
          },
        });
      } catch (err) {
        const message = errorMessage(err);
        broadcastToPlugin('threads', {
          type: 'THREADS_IMPORT_FAILED',
          errors: [message],
        });
      }
    },

    // ---- Chat/agent actions (merged from agent system) ----
    checkOnboarding: () => {
      if (!services.appData.hasOnboarded() && !birthFlowStarted) {
        birthFlowStarted = true;
        const assistantSettings = services.settings.getSection<AssistantSettings>('assistant');
        if (!assistantSettings.birthdate) {
          const birthdate = new Date().toISOString();
          services.settings.setInSection('assistant', ['birthdate'], birthdate);
          logger.info('Assistant birthdate set', { birthdate });
        }
        sendToSystem('brain', {
          type: 'TRIGGER_BRAIN_EVENT',
          eventType: 'onboarding.start',
          payload: {},
        });
      }
    },
    /**
     * The assistant's first flow runs once it can call a model, so the keys changing is what may start it. It waits
     * here rather than with the settings view because the birth flow, the assistant and its birthdate are this
     * feature's; the app only says that the user's keys changed.
     */
    startBirthFlowOnceKeyed: () => {
      const keyed = services.secrets.list().some((secret) => secret.selected && (REQUIRED_PROVIDERS as readonly string[]).includes(secret.provider));
      if (keyed && !services.settings.getSection<AssistantSettings>('assistant').birthdate) {
        sendToSystem('threads', { type: 'BIRTH_FLOW_START' });
      }
    },

    startBirthFlow: () => {
      const assistantSettings = services.settings.getSection<AssistantSettings>('assistant');

      if (!assistantSettings.birthdate) {
        const birthdate = new Date().toISOString();
        services.settings.setInSection('assistant', ['birthdate'], birthdate);
        logger.info('Assistant birthdate set', { birthdate });
      }

      sendToSystem('brain', {
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'onboarding.start',
        payload: {},
      });
    },
    // Sends the chat the commands when they differ from what it was last sent
    sendCommands: assign(({ context }) => {
      const commands = services.library.commands();
      const sent = JSON.stringify(commands);
      if (sent === context.sentCommands) return {};
      broadcastToPlugin('threads', { type: 'COMMANDS_UPDATED', commands });
      return { sentCommands: sent };
    }),
    sendChatConnectedData: () => {
      const data = repository.chatQueries.connectedData();
      broadcastToPlugin('threads', {
        type: 'AGENT_CONNECTED',
        data: { ...data, commands: services.library.commands() },
      });
    },
    rememberSentCommands: assign({ sentCommands: () => JSON.stringify(services.library.commands()) }),
    sendThreadChatData: ({ event }) => {
      const { threadId, restore } = threadsSpec.typeOf('OPEN_THREAD_CHAT', event);
      try {
        services.chat.openThreadChatAndRefreshRecent(threadId as EARS.EntityId, restore);
      } catch (err) {
        logger.warn('Thread not found for chat open, skipping', { threadId });
        broadcastToPlugin('threads', {
          type: 'THREAD_CHAT_ERROR',
          threadId: threadId as string,
          error: errorMessage(err),
        });
      }
    },
    loadMoreMessages: ({ event }) => {
      const { threadId, cursor } = threadsSpec.typeOf('LOAD_MORE_MESSAGES', event);
      const result = repository.chatQueries.paginatedMessages(threadId as EARS.EntityId, cursor);
      broadcastToPlugin('threads', {
        type: 'OLDER_MESSAGES_LOADED',
        threadId,
        ...result,
      });
    },
    sendThreadTabData: ({ event }) => {
      const { threadId } = threadsSpec.typeOf('OPEN_THREAD_TAB', event);
      try {
        services.chat.openThreadTabAndRefresh(threadId as EARS.EntityId);
      } catch (err) {
        logger.warn('Thread not found for tab open, skipping', { threadId });
        broadcastToPlugin('threads', {
          type: 'THREAD_CHAT_ERROR',
          threadId: threadId as string,
          error: errorMessage(err),
        });
      }
    },
    forwardUserMessage: ({ event }) => {
      try {
        const { text, mode, phase, threadId: providedThreadId, references, cwdOverride, forceDirectoryPicker } = threadsSpec.typeOf('USER_MSG', event);

        const sanitizedRefs = references ? {
          ...references,
          ...(references.files && {
            files: references.files.map(({ ...rest }: any) => rest),
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
          ...(mode ? { context: { agent: mode } } : {}),
        });

        if (threadData) {
          const fullThreadData = repository.threadQueries.byId(threadData.id);

          broadcastToPlugin('threads', {
            type: 'THREAD_CREATED',
            id: threadData.id,
            shortCode: threadData.shortCode,
            entityType: EARS.Entity.Thread,
            timestamp: threadData.timestamp,
            topic: fullThreadData?.topic,
            instructions: fullThreadData?.instructions,
            status: fullThreadData?.status
          });

          broadcastToPlugin('threads', {
            type: 'LOAD_CHAT_THREAD',
            data: repository.chatQueries.threadData(threadId)!
          });
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

          broadcastToPlugin('threads', {
            type: 'MESSAGE_ADDED',
            threadId: threadId as string,
            message: userMessage
          });
        }

        services.chat.sendRecentThreadsRefresh();

        sendToSystem('brain', {
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
      } catch (err) {
        logger.error('forwardUserMessage failed', { error: err });
        broadcastToPlugin('threads', {
          type: 'THREAD_CHAT_ERROR',
          threadId: 'threadId' in event && typeof event.threadId === 'string' ? event.threadId : '',
          error: errorMessage(err),
        });
      }
    },
    forwardUserCommand: ({ event }) => {
      try {
      const { command, text, mode, phase, threadId: providedThreadId, references, cwdOverride } = threadsSpec.typeOf('USER_COMMAND', event);

      const sanitizedRefs = references ? {
        ...references,
        ...(references.files && {
          files: references.files.map(({ ...rest }: any) => rest),
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
        ...(mode ? { context: { agent: mode } } : {}),
      });

      if (threadData) {
        const fullThreadData = repository.threadQueries.byId(threadData.id);

        broadcastToPlugin('threads', {
          type: 'THREAD_CREATED',
          id: threadData.id,
          shortCode: threadData.shortCode,
          entityType: EARS.Entity.Thread,
          timestamp: threadData.timestamp,
          topic: fullThreadData?.topic,
          instructions: fullThreadData?.instructions,
          status: fullThreadData?.status
        });

        broadcastToPlugin('threads', {
          type: 'LOAD_CHAT_THREAD',
          data: repository.chatQueries.threadData(threadId)!
        });
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

        broadcastToPlugin('threads', {
          type: 'MESSAGE_ADDED',
          threadId: threadId as string,
          message: userMessage
        });
      }

      services.chat.sendRecentThreadsRefresh();

      sendToSystem('brain', {
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
          ...(cwdOverride && { cwdOverride }),
        },
      });
      } catch (err) {
        logger.error('forwardUserCommand failed', { error: err });
      }
    },
    forkThread: ({ event }) => {
      const { messageId, threadId, threadTopic } = threadsSpec.typeOf('FORK_THREAD', event);
      if (!threadId) return;

      let result: { id: EARS.EntityId } | undefined;
      const forkContext: Record<string, any> = {};

      try {
        const sourceMessages = repository.chatQueries.threadData(threadId as EARS.EntityId)?.messages ?? [];
        const sourceIndex = sourceMessages.findIndex((m: any) => m.id === messageId);
        const sourceUserMessagesAfterFork = sourceIndex >= 0
          ? sourceMessages.slice(sourceIndex + 1).filter((m: any) => m.sender === 'user' && !m.deleted).length
          : 0;
        const originalTopic = threadTopic || 'Untitled';

        const forkCount = repository.threadCommands.forkCount(threadId as EARS.EntityId);
        const forkTopic = `Fork ${forkCount + 1} - ${originalTopic}`;

        result = services.chat.createThreadAndNotify({ topic: forkTopic, instructions: '' });
        if (!result) throw new Error('Failed to create thread');

        repository.threadCommands.linkFork(threadId as EARS.EntityId, result.id);

        repository.chatCommands.copyMessagesUpTo({
          sourceThreadId: threadId as EARS.EntityId,
          targetThreadId: result.id,
          upToMessageId: messageId,
        });

        // Set forkPending on the NEW thread so chat actions queue messages
        // until the async handle-fork actions finish persisting session state.
        const sourceThread = repository.threadQueries.byId(threadId as EARS.EntityId);
        const sourceContext = (sourceThread as any)?.context ?? {};
        for (const [key, value] of Object.entries(sourceContext)) {
          if (value && typeof value === 'object') {
            forkContext[key] = { forkPending: true };
          }
        }
        if (Object.keys(forkContext).length > 0) {
          repository.threadCommands.update(result.id, { context: forkContext });
        }

        services.chat.openThreadChatAndRefreshRecent(result.id);

        sendToSystem('brain', {
          type: 'TRIGGER_BRAIN_EVENT',
          eventType: 'thread.fork',
          payload: {
            sourceThreadId: threadId,
            sourceMessageId: messageId,
            newThreadId: result.id,
            sourceUserMessagesAfterFork,
          },
        });
      } catch (err) {
        logger.error('forkThread failed', { error: err });
        // Clear forkPending if it was set, so the thread doesn't permanently reject messages.
        if (result && Object.keys(forkContext).length > 0) {
          const clearContext = Object.fromEntries(
            Object.keys(forkContext).map(key => [key, { forkPending: undefined }])
          );
          repository.threadCommands.update(result.id, { context: clearContext });
        }
      }
    },
    revertThread: ({ event }) => {
      try {
      const { messageId, threadId, restoreFiles, userCliUuid } = threadsSpec.typeOf('REVERT_THREAD', event);
      const beforeMessages = repository.chatQueries.threadData(threadId as EARS.EntityId)?.messages ?? [];

      // Stop active processes before soft-deleting so nothing races
      // against the deletion (e.g. a stream consumer writing to messages).
      runThreadTeardown(threadId);

      const deletion = repository.chatCommands.softDeleteMessagesAfter({
        threadId: threadId as EARS.EntityId,
        messageId: messageId as EARS.EntityId,
      });
      const deletedIds = new Set(deletion.deletedIds);
      const deletedMessages = beforeMessages.filter((m: any) => deletedIds.has(m.id));
      const deletedUserMessageCount = deletedMessages.filter((m: any) => m.sender === 'user').length;

      // Determine which agent flows had messages deleted so each flow can
      // skip its revert handler when it isn't affected.
      const agents = {
        claudeCode: deletedMessages.some((m: any) =>
          m.context?.cliUuid || m.context?.agent === 'Claude Code'
        ),
        codex: deletedMessages.some((m: any) =>
          m.context?.agent === 'Codex'
        ),
      };
      const codexDeletedUserMessageCount = agents.codex
        ? deletedMessages.filter((m: any) => m.sender === 'user' && m.context?.agent === 'Codex').length
        : 0;

      services.chat.openThreadChatAndRefreshRecent(threadId as EARS.EntityId);

      // Unified `thread.revert` brain event — the `kind` discriminator
      // tells the claude-code flow which variant to run.
      sendToSystem('brain', {
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'thread.revert',
        payload: {
          threadId,
          messageId,
          kind: restoreFiles ? 'rewind' : 'revert',
          deletedMessageIds: deletion.deletedIds,
          deletedUserMessageCount,
          agents,
          codexDeletedUserMessageCount,
          ...(restoreFiles && userCliUuid ? { userCliUuid } : {}),
        },
      });
      } catch (err) {
        logger.error('revertThread failed', { error: err });
      }
    },
    summarizeThread: ({ event }) => {
      try {
      const { messageId, threadId } = threadsSpec.typeOf('SUMMARIZE_THREAD', event);
      const beforeMessages = repository.chatQueries.threadData(threadId as EARS.EntityId)?.messages ?? [];

      // Stop active processes before soft-deleting (same as revert).
      runThreadTeardown(threadId);

      // Matches Claude Code's native `direction: 'from'` — the pivot and
      // everything after it disappear from the visible transcript, then a
      // synthetic `/compact` turn runs against the truncated session.
      const deletion = repository.chatCommands.softDeleteMessagesAfter({
        threadId: threadId as EARS.EntityId,
        messageId: messageId as EARS.EntityId,
      });
      const deletedIds = new Set(deletion.deletedIds);
      const deletedMessages = beforeMessages.filter((m: any) => deletedIds.has(m.id));
      const deletedUserMessageCount = deletedMessages.filter((m: any) => m.sender === 'user').length;

      const agents = {
        claudeCode: deletedMessages.some((m: any) =>
          m.context?.cliUuid || m.context?.agent === 'Claude Code'
        ),
        codex: deletedMessages.some((m: any) =>
          m.context?.agent === 'Codex'
        ),
      };
      const codexDeletedUserMessageCount = agents.codex
        ? deletedMessages.filter((m: any) => m.sender === 'user' && m.context?.agent === 'Codex').length
        : 0;

      services.chat.openThreadChatAndRefreshRecent(threadId as EARS.EntityId);

      sendToSystem('brain', {
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'thread.revert',
        payload: { threadId, messageId, kind: 'summarize', deletedMessageIds: deletion.deletedIds, deletedUserMessageCount, agents, codexDeletedUserMessageCount },
      });
      } catch (err) {
        logger.error('summarizeThread failed', { error: err });
      }
    },
    pauseTurn: ({ event }) => {
      const { threadId } = threadsSpec.typeOf('PAUSE_TURN', event);
      sendToSystem('brain', {
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'user.thread.pause',
        payload: { threadId },
      });
    },
    forwardBrainEvent: ({ event }) => {
      const { eventType, payload } = threadsSpec.typeOf('FORWARD_BRAIN_EVENT', event);
      sendToSystem('brain', { type: 'TRIGGER_BRAIN_EVENT', eventType, payload });
    },
    forwardInteractiveMessageResponse: ({ event }) => {
      try {
      const { messageId, threadId, response } = threadsSpec.typeOf('INTERACTIVE_MSG_RESPONSE', event);

      if (!repository.chatQueries.messageById(messageId as EARS.EntityId)) return;

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

      sendToSystem('brain', {
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'interactive.message.response',
        payload: { messageId, threadId, response }
      });

      broadcastToPlugin('threads', {
        type: 'UPDATE_MESSAGE_STATE',
        messageId,
        responseTimestamp: result.responseTimestamp,
        blockResponse: response,
        ...(result.blocks && { blocks: result.blocks }),
        ...(asideText && { asideText })
      });
      } catch (err) {
        logger.error('forwardInteractiveMessageResponse failed', { error: err });
      }
    },
    deleteMessage: ({ event }) => {
      const { messageId } = threadsSpec.typeOf('DELETE_MESSAGE', event);
      if (!repository.chatQueries.messageById(messageId as EARS.EntityId)) return;
      tx(messageId as EARS.EntityId).destroy();
    },
    toggleCompacted: ({ event }) => {
      const { markerId, compacted } = threadsSpec.typeOf('TOGGLE_COMPACTED', event);
      const messageIds = repository.chatCommands.toggleMarkerCompacted(
        markerId as EARS.EntityId,
        compacted,
      );
      for (const msgId of messageIds) {
        broadcastToPlugin('threads', {
          type: 'UPDATE_MESSAGE_STATE',
          messageId: msgId as string,
          compacted,
        });
      }
    },
  },
}).createMachine(
  {
    id: 'threads',
    initial: 'idle',
    context: () => ({}),
    on: {
      CLIENT_CONNECTED: {
        actions: ['sendThreadsConnectedData', 'sendChatConnectedData', 'rememberSentCommands', 'checkOnboarding'],
      },
      FEATURE_SETTINGS_UPDATED: {
        actions: 'handleSettingsUpdate',
      },
      // Chat/agent global events
      OPEN_THREAD_CHAT: {
        actions: 'sendThreadChatData',
      },
      LOAD_MORE_MESSAGES: {
        actions: 'loadMoreMessages',
      },
      OPEN_THREAD_TAB: {
        actions: 'sendThreadTabData',
      },
      BIRTH_FLOW_START: {
        actions: 'startBirthFlow',
      },
      SECRETS_CHANGED: {
        actions: 'startBirthFlowOnceKeyed',
      },
      COMMANDS_CHANGED: {
        actions: 'sendCommands',
      },
      PACK_CHANGED: {
        actions: 'sendCommands',
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

const threadsEntry = { spec: threadsSpec, machine: threadsSystem };

export default threadsEntry;
