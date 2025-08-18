import { setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { z } from 'zod';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents } from '@/core/utils/actor-helpers';
import { repository } from '@/repository';
import { createLogger } from '@/core/utils/debug/logger';
import { brain } from '../brain/system';
import { RecentThreadRefreshData, AgentThreadData, AgentStartupData } from './types';
import type { EARS } from '@/core/types';
import { initializeMockData } from './repository/mock-artifacts';

const logger = createLogger('agent');

export const agent = 'agent' as const;

const busEvent = systemBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { text: z.string(), mode: z.enum(['plan', 'work', 'chat', 'note']).optional(), threadId: z.string().optional() }),
  busEvent('OPEN_THREAD_CHAT', { threadId: z.string() }),
  busEvent('OPEN_THREAD_TAB', { threadId: z.string(), label: z.string() }),
  busEvent('REFRESH_DASHBOARD', {}),
  busEvent('CANCEL'),
  busEvent('APPROVE_TODO_LIST', { artifactId: z.string(), tasks: z.array(z.any()) }),
  busEvent('REJECT_TODO_LIST', { artifactId: z.string() }),
] as const

export type AgentInternalEvents = SystemEvents

export type OutgoingAgentEvents =
  | { type: 'AGENT_STARTUP'; data: AgentStartupData }
  | { type: 'REFRESH_RECENT_THREADS'; data: RecentThreadRefreshData }
  | { type: 'LOAD_CHAT_THREAD', data: AgentThreadData }
  | { type: 'ARTIFACT_ADDED'; tabId: string; artifact: any }
  | { type: 'THREAD_TAB_REQUESTED'; threadId: string; artifacts: any[] }

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
    sendStartupData: ({ system }) => {
      system.get(bus).send(emit(agent, { 
        type: 'AGENT_STARTUP',
        data: repository.agentQueries.startupData()
      }));
    },
    sendRefreshThreads: ({ system }) => {
      system.get(bus).send(emit(agent, { 
        type: 'REFRESH_RECENT_THREADS',
        data: repository.agentQueries.refreshThreadsData()
      }));
    },
    sendRefreshDashboard: ({ system }) => {
      // ? Re-send startup data which includes refreshed dashboard
      system.get(bus).send(emit(agent, { 
        type: 'AGENT_STARTUP',
        data: repository.agentQueries.startupData()
      }));
    },
    initializeMockData: () => {
      // initializeMockData();
    },
    sendThreadChatData: ({ system, event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId as EARS.EntityId;

      system.get(bus).send(emit(agent, { 
        type: 'LOAD_CHAT_THREAD',
        data: repository.agentQueries.threadData(threadId),
      }));
    },
    sendThreadTabData: ({ system, event }) => {
      const { threadId } = typeOf('OPEN_THREAD_TAB', event);
      
      // Query the artifacts from repository
      const artifacts = repository.agentQueries.threadArtifacts(threadId as EARS.EntityId);
      
      system.get(bus).send(emit(agent, { 
        type: 'THREAD_TAB_REQUESTED',
        threadId,
        artifacts
      }));
    },
    forwardUserMessage: ({ system, event }) => {
      const { text, mode, threadId } = typeOf('USER_MSG', event);
      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'user.message',
        payload: {
          text,
          mode: mode || 'chat',
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
    entry: ['initializeMockData'],
    on: {
      CLIENT_CONNECTED: {
        actions: ['sendStartupData'],
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
