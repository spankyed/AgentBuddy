import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import { v4 as uuid } from 'uuid';
import { db, schema } from '@/db/client';
import { chatStream, message } from '@/systems/agent/llm/runner';
import { rows } from '../_backend/mock-data';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { z } from 'zod';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
import { addMessageToLatestThread, getLatestMessage } from './repository';
import type { EARS } from '@/shared/ears/types';
import { AgentStartupData, AgentThreadData, ThreadExtendedData } from '@/types';
import { getThreadChatData } from './repository/read';
import agentStartupData from './repository/startup';

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
        data: agentStartupData()
      }));
    },
    logError: (_, event: ErrorActorEvent<unknown, string>) => {
      console.error('Chat stream error:', event.error);
    },
    sendThreadChatData: ({ system, event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId as EARS.EntityId;

      system.get(bus).send(emit(agent, { 
        type: 'LOAD_CHAT_THREAD',
        data: getThreadChatData(threadId),
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
    storeUserMessage: ({ context, event }) => {
      const text = typeOf('USER_MSG', event).text;
      addMessageToLatestThread(text);
    },
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
          USER_MSG: {
            target: 'processMessage',
            actions: 'storeUserMessage',
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
              message("user", getLatestMessage()),
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
