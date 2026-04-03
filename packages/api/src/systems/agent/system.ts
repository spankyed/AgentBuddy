import { setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/helpers/event-helpers';
import { fromSystem, systemBus } from '@/core/helpers/event-helpers';
import { z } from 'zod';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents } from '@/core/helpers/actor-helpers';
import { repository } from '@/repository';
import { createLogger } from '@/core/helpers/debug/logger';
import { brain } from '../brain/system';
import services from '@/services';
import { AgentThreadData, AgentConnectedData, AgentSettings, RecentThreadRefreshData, CommandItem } from './types';
import { EARS } from '@/core/types';
import type { MessageEntity, BlockConfig } from '@/systems/threads/types';
import type { FieldContent } from '@/systems/library/types';

const logger = createLogger('agent');

export const agent = 'agent' as const;

const busEvent = systemBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { text: z.string(), mode: z.string().optional(), phase: z.string().optional(), threadId: z.string().optional(), references: z.object({
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
  }).optional() }),
  busEvent('OPEN_THREAD_CHAT', { threadId: z.string() }),
  busEvent('OPEN_THREAD_TAB', { threadId: z.string(), label: z.string(), pinned: z.boolean().optional() }),
  busEvent('CANCEL'),
  busEvent('APPROVE_TODO_LIST', { artifactId: z.string(), tasks: z.array(z.any()) }),
  busEvent('REJECT_TODO_LIST', { artifactId: z.string() }),
  busEvent('INTERACTIVE_MSG_RESPONSE', {
    messageId: z.string(),
    threadId: z.string(),
    response: z.any() // Response data for block-based interactions
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
    references: z.object({
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
    }).optional(),
  }),
] as const

export type AgentInternalEvents =
  | SystemEvents
  | { type: 'API_KEYS_CHANGED' }
  | { type: 'BIRTH_FLOW_START' }

export type OutgoingAgentEvents =
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

export interface AgentContext { }

export const AgentSystemEvents = fromSystem(IncomingAgentEvents)<OutgoingAgentEvents, typeof agent>()
type ReceivableEvents = MergeReceivable<typeof IncomingAgentEvents, AgentInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

export const agentSystem = setup({
  types: {
    context: {} as AgentContext,
    events: {} as ReceivableEvents,
  },
  actions: {
    startBirthFlow: ({ system }) => {
      // Triggered from tour completion — fires brain event to start onboarding flow
      const assistantSettings = repository.settingsQueries.getAssistantSettings();

      if (!assistantSettings.birthdate) {
        const birthdate = new Date().toISOString();
        repository.settingsCommands.updateSettings('assistant', null, ['birthdate'], birthdate);
        logger.info('Assistant birthdate set', { birthdate });
      }

      // Fire tour.complete brain event to trigger the onboarding subflow
      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'tour.complete',
        payload: {},
      });
    },
    sendConnectedData: async ({ system }) => {
      const data = repository.agentQueries.connectedData();

      // Fetch commands from internal/commands library document
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

      system.get(bus).send(emit(agent, {
        type: 'AGENT_CONNECTED',
        data: { ...data, commands },
      }));
    },
    sendApiKeyStatus: ({ system }) => {
      const hasRequiredApiKeys = repository.agentQueries.hasRequiredApiKeys();
      system.get(bus).send(emit(agent, {
        type: 'API_KEYS_STATUS',
        hasRequiredApiKeys
      }));
    },
    sendThreadChatData: ({ system, event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId as EARS.EntityId;

      // Use chat service for automatic refresh
      services.chat.openThreadChatAndRefreshRecent(threadId);
    },
    sendThreadTabData: ({ system, event }) => {
      const { threadId } = typeOf('OPEN_THREAD_TAB', event);

      // Use chat service for automatic refresh
      services.chat.openThreadTabAndRefresh(threadId as EARS.EntityId);
    },
    forwardUserMessage: ({ system, event }) => {
      const { text, mode, phase, threadId: providedThreadId, references } = typeOf('USER_MSG', event);

      // Sanitize references: strip any base64 previewUrl from files (defensive)
      const sanitizedRefs = references ? {
        ...references,
        ...(references.files && {
          files: references.files.map(({ previewUrl, ...rest }: any) => rest),
        }),
      } : undefined;

      // Step 1: Ensure we have a thread (create if needed)
      let threadId: EARS.EntityId;
      let threadData: any = null;

      if (!providedThreadId) {
        const result = repository.agentCommands.createThreadFromMessage(text);
        threadId = result.threadId;
        threadData = result.threadData;

        logger.info('Created new thread for user message', {
          threadId,
          shortCode: result.threadData.shortCode,
        });

        // Mark newly created thread as visited since we're loading it into chat view
        repository.threadCommands.markAsVisited(threadId);
      } else {
        threadId = providedThreadId as EARS.EntityId;
      }

      // Step 2: Save the user message (also updates thread's lastMessageTimestamp)
      const messageResult = repository.agentCommands.addMessage({
        threadId,
        text,
        sender: 'user',
        references: sanitizedRefs,
      });

      // Step 3: Notify frontend if new thread was created
      if (threadData) {
        const fullThreadData = repository.threadQueries.byId(threadData.id);

        // Notify threads plugin about the new thread
        system.get(bus).send(emit('threads', {
          type: 'THREAD_CREATED',
          id: threadData.id,
          shortCode: threadData.shortCode,
          entityType: EARS.Entity.Thread,
          timestamp: threadData.timestamp,
          topic: fullThreadData?.topic,
          instructions: fullThreadData?.instructions,
          status: fullThreadData?.status
        } as any));

        // Explicitly load the newly created thread into chat view
        system.get(bus).send(emit(agent, {
          type: 'LOAD_CHAT_THREAD',
          data: threadData
        }));
      } else {
        // Step 4: Send MESSAGE_ADDED event for the user message
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

        system.get(bus).send(emit(agent, {
          type: 'MESSAGE_ADDED',
          threadId: threadId as string,
          message: userMessage
        }));
      }

      // Refresh recent threads list (affects ordering when message added or thread created)
      services.chat.sendRecentThreadsRefresh();

      // Step 5: Forward to brain for flow processing
      const brainActor = getActor(system, brain);

      // setTimeout(() => {
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
      // }, 0);
    },
    forwardUserCommand: ({ system, event }) => {
      const { command, text, mode, phase, threadId: providedThreadId, references } = typeOf('USER_COMMAND', event);

      // Sanitize references
      const sanitizedRefs = references ? {
        ...references,
        ...(references.files && {
          files: references.files.map(({ previewUrl, ...rest }: any) => rest),
        }),
      } : undefined;

      // Step 1: Ensure we have a thread (create if needed)
      let threadId: EARS.EntityId;
      let threadData: any = null;

      if (!providedThreadId) {
        const result = repository.agentCommands.createThreadFromMessage(text || `/${command}`);
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

      // Step 2: Save the user message with command metadata
      const messageResult = repository.agentCommands.addMessage({
        threadId,
        text: text ? `/${command} ${text}` : `/${command}`,
        sender: 'user',
        references: sanitizedRefs,
        isCommand: true,
        command,
      });

      // Step 3: Notify frontend if new thread was created
      if (threadData) {
        const fullThreadData = repository.threadQueries.byId(threadData.id);

        system.get(bus).send(emit('threads', {
          type: 'THREAD_CREATED',
          id: threadData.id,
          shortCode: threadData.shortCode,
          entityType: EARS.Entity.Thread,
          timestamp: threadData.timestamp,
          topic: fullThreadData?.topic,
          instructions: fullThreadData?.instructions,
          status: fullThreadData?.status
        } as any));

        system.get(bus).send(emit(agent, {
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

        system.get(bus).send(emit(agent, {
          type: 'MESSAGE_ADDED',
          threadId: threadId as string,
          message: userMessage
        }));
      }

      // Refresh recent threads list
      services.chat.sendRecentThreadsRefresh();

      // Step 4: Forward to brain as user.command event
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

      // Count existing forks via relation
      const forkCount = repository.threadCommands.forkCount(threadId as EARS.EntityId);
      const forkTopic = `Fork ${forkCount + 1} - ${originalTopic}`;

      // Create new thread
      const result = services.chat.createThreadAndNotify({ topic: forkTopic, instructions: '' });

      // Link forked thread back to source
      repository.threadCommands.linkFork(threadId as EARS.EntityId, result.id);

      // Copy messages from source thread up to fork point
      if (threadId) {
        repository.agentCommands.copyMessagesUpTo({
          sourceThreadId: threadId as EARS.EntityId,
          targetThreadId: result.id,
          upToMessageId: messageId,
        });
      }

      // Open the new thread in chat
      services.chat.openThreadChatAndRefreshRecent(result.id);

      // Fire brain event
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

      // Soft-delete all messages after the target message
      repository.agentCommands.softDeleteMessagesAfter({
        threadId: threadId as EARS.EntityId,
        messageId: messageId as EARS.EntityId,
      });

      // Reload thread chat
      services.chat.openThreadChatAndRefreshRecent(threadId as EARS.EntityId);

      // Fire brain event
      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'thread.revert',
        payload: { threadId, messageId },
      });
    },
    forwardInteractiveMessageResponse: ({ system, event }) => {
      const { messageId, threadId, response } = typeOf('INTERACTIVE_MSG_RESPONSE', event);

      // Save response and auto-toggle if needed (single operation)
      const result = repository.agentCommands.updateMessageBlockResponse({
        messageId: messageId as EARS.EntityId,
        response
      });

      // Forward to brain for flow processing
      getActor(system, brain).send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'interactive.message.response',
        payload: { messageId, threadId, response }
      });

      // Send single UPDATE_MESSAGE_STATE with all updates
      system.get(bus).send(emit(agent, {
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
    id: agent,
    initial: 'idle',
    context: ({}),
    entry: [],
    on: {
      CLIENT_CONNECTED: {
        actions: ['sendConnectedData'],
      },
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
    },
    states: {
      idle: {
        on: {
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
