import { setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { z } from 'zod';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents } from '@/core/utils/actor-helpers';
import { repository } from '@/repository';
import { createLogger } from '@/core/utils/debug/logger';
import { brain } from '../brain/system';
import { RecentThreadRefreshData, AgentThreadData, AgentConnectedData, AgentSettings } from './types';
import type { EARS } from '@/core/types';
import { initializeMockData } from './repository/mock-artifacts';

const logger = createLogger('agent');

export const agent = 'agent' as const;

const busEvent = systemBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { text: z.string(), mode: z.string().optional(), phase: z.string().optional(), threadId: z.string().optional() }),
  busEvent('OPEN_THREAD_CHAT', { threadId: z.string() }),
  busEvent('OPEN_THREAD_TAB', { threadId: z.string(), label: z.string() }),
  busEvent('REFRESH_DASHBOARD', {}),
  busEvent('CANCEL'),
  busEvent('APPROVE_TODO_LIST', { artifactId: z.string(), tasks: z.array(z.any()) }),
  busEvent('REJECT_TODO_LIST', { artifactId: z.string() }),
] as const

export type AgentInternalEvents =
  | SystemEvents
  | { type: 'API_KEYS_CHANGED' }

export type OutgoingAgentEvents =
  | { type: 'AGENT_CONNECTED'; data: AgentConnectedData }
  | { type: 'REFRESH_RECENT_THREADS'; data: RecentThreadRefreshData }
  | { type: 'LOAD_CHAT_THREAD', data: AgentThreadData }
  | { type: 'ARTIFACT_ADDED'; tabId: string; artifact: any }
  | { type: 'THREAD_TAB_REQUESTED'; threadId: string; artifacts: any[] }
  | { type: 'AGENT_SETTINGS_UPDATED'; settings: AgentSettings }
  | { type: 'API_KEYS_STATUS'; hasRequiredApiKeys: boolean }

export interface AgentContext {}

export const AgentSystemEvents = fromSystem(IncomingAgentEvents)<OutgoingAgentEvents, typeof agent>()
type ReceivableEvents = MergeReceivable<typeof IncomingAgentEvents, AgentInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

export const agentSystem = setup({
  types: {
    context: {} as AgentContext,
    events: {} as ReceivableEvents,
  },
  actions: {
    birthAssistant: () => {
      // Check if we need to create the assistant birth thread
      const internalSettings = repository.settingsQueries.getInternalSettings();

      if (!internalSettings.hasOnboarded && !internalSettings.assistantBirthdate) {
        // Create the birth thread for first-time users (will check for existing internally)
        const { threadId, artifactId } = repository.agentCommands.createAssistantBirthThread();

        // Only log if we actually created a new thread
        const isNew = !internalSettings.assistantBirthdate;
        if (isNew) {
          logger.info('Created Assistant Birth thread', { threadId, artifactId });
        } else {
          logger.debug('Using existing Assistant Birth thread', { threadId });
        }
      }
    },
    sendConnectedData: ({ system }) => {
      system.get(bus).send(emit(agent, {
        type: 'AGENT_CONNECTED',
        data: repository.agentQueries.connectedData()
      }));
    },
    sendRefreshThreads: ({ system }) => {
      system.get(bus).send(emit(agent, { 
        type: 'REFRESH_RECENT_THREADS',
        data: repository.agentQueries.refreshThreadsData()
      }));
    },
    sendRefreshDashboard: ({ system }) => {
      // ? Re-send connected data which includes refreshed dashboard
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

      // Mark thread as visited when opening chat
      repository.threadCommands.markAsVisited(threadId);

      const busSvc = system.get(bus);

      // Send thread data
      busSvc.send(emit(agent, {
        type: 'LOAD_CHAT_THREAD',
        data: repository.agentQueries.threadData(threadId),
      }));

      // Refresh recent threads list to reflect new ordering
      busSvc.send(emit(agent, {
        type: 'REFRESH_RECENT_THREADS',
        data: repository.agentQueries.refreshThreadsData()
      }));
    },
    sendThreadTabData: ({ system, event }) => {
      const { threadId } = typeOf('OPEN_THREAD_TAB', event);

      // Mark thread as visited when opening tab
      repository.threadCommands.markAsVisited(threadId as EARS.EntityId);

      // Query the artifacts from repository
      const artifacts = repository.agentQueries.threadArtifacts(threadId as EARS.EntityId);

      const busSvc = system.get(bus);

      // Send thread tab data
      busSvc.send(emit(agent, {
        type: 'THREAD_TAB_REQUESTED',
        threadId,
        artifacts
      }));

      // Refresh recent threads list to reflect new ordering
      busSvc.send(emit(agent, {
        type: 'REFRESH_RECENT_THREADS',
        data: repository.agentQueries.refreshThreadsData()
      }));
    },
    forwardUserMessage: ({ system, event }) => {
      const { text, mode, phase, threadId } = typeOf('USER_MSG', event);
      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'user.message',
        payload: {
          text,
          mode,
          phase,
          threadId,
        },
      });
    }
  },
}).createMachine(
  {
    id: agent,
    initial: 'idle',
    context: ({}),
    entry: ['birthAssistant'],
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
      REFRESH_DASHBOARD: {
        actions: 'sendRefreshDashboard',
      },
      API_KEYS_CHANGED: {
        actions: 'sendApiKeyStatus',
      },
    },
    states: {
      idle: {
        on: {
          USER_MSG: {
            actions: 'forwardUserMessage',
          },
        },
      },
    },
  }
);
