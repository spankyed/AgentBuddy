import { setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { z } from 'zod';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents } from '@/core/utils/actor-helpers';
import { repository } from '@/repository';
import { createLogger } from '@/core/utils/debug/logger';
import { brain } from '../brain/system';
import { AgentThreadRefreshData, AgentThreadData } from './types';
import type { EARS } from '@/core/types';

const logger = createLogger('agent');

export const agent = 'agent' as const;

const busEvent = systemBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { text: z.string(), mode: z.enum(['plan', 'work', 'chat', 'note']).optional(), threadId: z.string().optional() }),
  busEvent('OPEN_THREAD_CHAT', { threadId: z.string() }),
  busEvent('OPEN_THREAD_TAB', { threadId: z.string(), label: z.string() }),
  busEvent('CANCEL'),
] as const

export type AgentInternalEvents = SystemEvents

export type OutgoingAgentEvents =
  | { type: 'REFRESH_THREADS'; data: AgentThreadRefreshData }
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
    sendAgentThreadRefreshData: ({ system }) => {
      system.get(bus).send(emit(agent, { 
        type: 'REFRESH_THREADS',
        data: repository.agentQueries.startupData()
      }));
    },

    sendThreadChatData: ({ system, event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId as EARS.EntityId;

      system.get(bus).send(emit(agent, { 
        type: 'LOAD_CHAT_THREAD',
        data: repository.agentQueries.threadData(threadId),
      }));
    },
    sendThreadTabData: ({ system, event }) => {
      const { threadId, label } = typeOf('OPEN_THREAD_TAB', event);
      
      // Send mock artifacts for the thread
      const mockArtifacts = [
        {
          id: `${threadId}-code-1`,
          type: 'code',
          title: 'Component Code',
          content: `// ${label} Component
import React from 'react';

export function ${label.replace(/\s+/g, '')}() {
  return (
    <div>
      <h1>${label}</h1>
      <p>This is a mock code artifact for ${label}</p>
    </div>
  );
}`
        },
        {
          id: `${threadId}-text-1`,
          type: 'text',
          title: 'Documentation',
          content: `# ${label} Documentation\n\nThis is documentation for the ${label} feature. It includes:\n\n- Overview of functionality\n- Implementation details\n- Usage examples\n- Best practices`
        }
      ];
      
      system.get(bus).send(emit(agent, { 
        type: 'THREAD_TAB_REQUESTED',
        threadId,
        artifacts: mockArtifacts
      }));
    },
    fbeUserMessage: ({ system, event }) => {
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
    on: {
      CLIENT_CONNECTED: {
        actions: 'sendAgentThreadRefreshData',
      },
      OPEN_THREAD_CHAT: {
        actions: 'sendThreadChatData',
      },
      OPEN_THREAD_TAB: {
        actions: 'sendThreadTabData',
      },
    },
    states: {
      idle: {
        on: {
          USER_MSG: {
            actions: 'fbeUserMessage',
          },
        },
      },
    },
  }
);
