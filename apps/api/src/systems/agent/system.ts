import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import { chatStream, message } from '@/systems/agent/llm/runner';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { z } from 'zod';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './repository';
import type { EARS } from '@/shared/ears/types';
import { AgentStartupData, AgentThreadData, FlowTNodeData, ThreadExtendedData, TNodeEntity, TNodeUpdate } from '@/types';
import { agentQueries } from './repository';
import { createLogger } from '@/systems/logs/logger';
import { brain } from '../brain/system';

const logger = createLogger('agent');

export const agent = 'agent' as const;

const busEvent = systemBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { text: z.string() }),
  busEvent('OPEN_THREAD_CHAT', { threadId: z.string() }),
  busEvent('CANCEL'),
] as const

export type AgentInternalEvents = 
  | { type: 'LLM_DONE' }
  | { type: 'LLM_ABORTED' }
  | { type: 'LLM_ERROR'; error: unknown }
  | { type: 'TOKEN_STREAM'; token: string }
  | SystemEvents

export type OutgoingAgentEvents =
  | { type: 'AGENT_STARTUP'; data: AgentStartupData }
  | { type: 'LOAD_CHAT_THREAD', data: AgentThreadData }
  | { type: 'ADD_ASSISTANT_MESSAGE'; text: string }
  | { type: 'LLM_DONE' }
  | { type: 'LLM_ABORTED' }
  | { type: 'LLM_ERROR'; error: unknown }
  | { type: 'TOKEN_STREAM'; token: string }
  | { type: 'TNODE_OPENED'; tNodeId: EARS.EntityId; data: FlowTNodeData }
  | { type: 'EVENT_TNODE_SPAWNED'; tNode: TNodeEntity }
  | { type: 'TNODE_SPAWNED'; tNode: TNodeEntity; parentId?: EARS.EntityId; eventTNodeId?: EARS.EntityId }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }

export interface AgentContext {
  agentId: EARS.EntityId;
  userPrompt?: string;
}

export const AgentSystemEvents = fromSystem(IncomingAgentEvents)<OutgoingAgentEvents, typeof agent>()
type ReceivableEvents = MergeReceivable<typeof IncomingAgentEvents, AgentInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

export const agentSystem = setup({
  types: {
    input: {} as EARS.EntityId,
    context: {} as AgentContext,
    events: {} as ReceivableEvents,
  },
  actors: {
    chatStream
  },
  actions: {
    sendAgentStartupData: ({ system }) => {
      system.get(bus).send(emit(agent, { 
        type: 'AGENT_STARTUP',
        data: agentQueries.startupData()
      }));
    },
    logError: (_, event: ErrorActorEvent<unknown, string>) => {
      logger.error('Chat stream error:', { error: event.error });
    },
    sendThreadChatData: ({ system, event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId as EARS.EntityId;

      system.get(bus).send(emit(agent, { 
        type: 'LOAD_CHAT_THREAD',
                  data: agentQueries.threadData(threadId),
      }));
    },
    sendToken: ({ system, event }) => {
      system.get(bus).send(emit(agent, { 
        type: 'TOKEN_STREAM',
        token: typeOf('TOKEN_STREAM', event).token
      }));
    },
    sendLLMDone: ({ system, event }) => {
      system.get(bus).send(emit(agent, { 
        type: 'LLM_DONE',
      }));
    },
    sendLLMAborted: ({ system }) => {
      system.get(bus).send(emit(agent, { 
        type: 'LLM_ABORTED',
      }));
    },
    sendLLMError: ({ system, event }) => {
      system.get(bus).send(emit(agent, { 
        type: 'LLM_ERROR',
        error: typeOf('LLM_ERROR', event).error
      }));
    },
    // storeUserMessage: ({ context, event }) => {
    //   const text = typeOf('USER_MSG', event).text;
    //   addMessageToLatestThread(text);
    // },
    fireBrainEvent: ({ system, event }) => {
      const text = typeOf('USER_MSG', event).text;
      const brainActor = getActor(system, brain);
      console.log('brainActor: ', brainActor.send);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'user.message',
        payload: text,
      });
    }
  },
}).createMachine(
  {
    id: agent,
    initial: 'idle',
    context: ({ input }) => ({
      agentId: input,
      userPrompt: undefined,
    }),
    on: {
      CLIENT_CONNECTED: {
        actions: 'sendAgentStartupData',
      },
      OPEN_THREAD_CHAT: {
        actions: 'sendThreadChatData',
      },
      TOKEN_STREAM: {
        actions: 'sendToken',
      },
      LLM_ABORTED: {
        actions: 'sendLLMAborted',
      },
      LLM_ERROR: {
        actions: 'sendLLMError',
      },
    },
    states: {
      idle: {
        on: {
          // USER_MSG: {
          //   target: 'processMessage',
          //   actions: 'storeUserMessage',
          // },
          USER_MSG: {
            // target: 'processMessage',
            actions: 'fireBrainEvent',
          },
        },
      },
      processMessage: {
        invoke: {
          id: 'chatStream',
          src: 'chatStream',
          input: ({ context }) => ({
            messages: [
              message('system', 'You are a helpful AI assistant.'),
              // message("user", getLatestMessage()), // TODO: Implement message retrieval
            ],
            provider: 'openai',
          }),
          onDone: {
            target: 'idle',
            actions: 'sendLLMDone',
          },
          onError: {
            target: 'idle',
            actions: 'sendLLMError',
          }
        },
        on: {
          LLM_ABORTED: 'idle',
          LLM_ERROR: {
            target: 'idle',
            actions: 'sendLLMError',
          },
          CANCEL: {
            actions: cancel("chatStream"),
          }
        },
      },
    },
  }
);

const sendBack = sendParentSafe<AgentInternalEvents>();

async function runLlm(ctx: AgentContext, signal: AbortSignal) {
  // const runner = new LlmRunner(model);

  // for await (const token of runner.stream(userPrompt, { signal })) {
    // Persist & bubble up token events
    // sendBack({ type: 'TOKEN', token });
  // }

  sendBack({ type: 'LLM_DONE' });
  // Persist assistant message
  // await db
  //   .insert(schema.message)
  //   .values({
  //     id: uuid(),
  //     sessionId,
  //     role: 'assistant',
  //     text: runner.buffer(),
  //     createdAt: Date.now(),
  //   })
  //   .run();
}
