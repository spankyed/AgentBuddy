import { setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { z } from 'zod';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents } from '@/core/utils/actor-helpers';
import { repository } from '@/repository';
import { createLogger } from '@/core/utils/debug/logger';
import { brain } from '../brain/system';
import services from '@/services';
import { AgentThreadData, AgentConnectedData, AgentSettings, RecentThreadRefreshData } from './types';
import { EARS } from '@/core/types';
import { initializeMockData } from './repository/mock-artifacts';
import type { MessageEntity, BlockConfig } from '@/systems/threads/types';

const logger = createLogger('agent');

export const agent = 'agent' as const;

const busEvent = systemBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { text: z.string(), mode: z.string().optional(), phase: z.string().optional(), threadId: z.string().optional() }),
  busEvent('OPEN_THREAD_CHAT', { threadId: z.string() }),
  busEvent('OPEN_THREAD_TAB', { threadId: z.string(), label: z.string() }),
  busEvent('CANCEL'),
  busEvent('APPROVE_TODO_LIST', { artifactId: z.string(), tasks: z.array(z.any()) }),
  busEvent('REJECT_TODO_LIST', { artifactId: z.string() }),
  busEvent('INTERACTIVE_MSG_RESPONSE', {
    messageId: z.string(),
    threadId: z.string(),
    response: z.any() // Response data for block-based interactions
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
  | { type: 'THREAD_TAB_REQUESTED'; threadId: string; topic: string; artifacts: any[] }
  | { type: 'AGENT_SETTINGS_UPDATED'; settings: AgentSettings }
  | { type: 'API_KEYS_STATUS'; hasRequiredApiKeys: boolean }
  | { type: 'UPDATE_MESSAGE_STATE'; messageId: string; text?: string; blocks?: BlockConfig[]; responseTimestamp?: number; blockResponse?: any }
  | { type: 'MESSAGE_ADDED'; threadId: string; message: MessageEntity }

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
      // Triggered when required API keys are configured
      const assistantSettings = repository.settingsQueries.getAssistantSettings();

      if (!assistantSettings.birthdate) {
        const birthdate = new Date().toISOString();

        repository.settingsCommands.updateSettings('assistant', null, ['birthdate'], birthdate);
        logger.info('Assistant birthdate set', { birthdate });

        // Trigger the brain event to start the birth flow
        const brainActor = getActor(system, brain);
        brainActor.send({
          type: 'TRIGGER_BRAIN_EVENT',
          eventType: 'llm.now.available',
          payload: {} // Brain will handle thread creation
        });
      }
    },
    sendConnectedData: ({ system }) => {
      system.get(bus).send(emit(agent, {
        type: 'AGENT_CONNECTED',
        data: repository.agentQueries.connectedData()
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
      const { text, mode, phase, threadId: providedThreadId } = typeOf('USER_MSG', event);

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
          },
        });
      // }, 0);
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
        },
      },
    },
  }
);
