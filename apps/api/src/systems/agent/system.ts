import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import { v4 as uuid } from 'uuid';
import { db, schema } from '@/db/client';
import { chatStream, message } from '@/systems/agent/llm/runner';
import { rows } from './mock-data';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { z } from 'zod';
import { bus } from '@/systems/_bus/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
import { addMessageToLatestThread, getLatestMessage } from './accessors';
import type { EARS } from '@/shared/ears/types';

export const agent = 'agent' as const;

const busEvent = systemBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { content: z.string() }),
  busEvent('CANCEL'),
] as const

export type AgentInternalEvents = 
  | { type: 'STARTUP' }
  | { type: 'LLM_DONE' }
  | { type: 'LLM_ABORTED' }
  | { type: 'LLM_ERROR'; error: unknown }
  | { type: 'TOKEN_STREAM'; token: string }

export type OutgoingAgentEvents = 
  | { type: 'STARTUP'; rows: typeof rows }
  | { type: 'ADD_ASSISTANT_MESSAGE'; content: string }
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
    logError: (_, event: ErrorActorEvent<unknown, string>) => {
      console.error('Chat stream error:', event.error);
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
    sendFEWakeup: ({ system }) => {
      system.get(bus).send(emit(agent, { 
        type: 'STARTUP',
        rows: rows
      }));
    },
    storeUserMessage: ({ context, event }) => {
      const content = typeOf('USER_MSG', event).content;
      addMessageToLatestThread(content);
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
      TOKEN_STREAM: {
        actions: 'sendToken',
      },
      LLM_ABORTED: {
        actions: 'sendLLMAborted',
      },
      LLM_ERROR: {
        actions: 'sendLLMError',
      },
      STARTUP: {
        target: '.idle',
        actions: 'sendFEWakeup',
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
  //     content: runner.buffer(),
  //     createdAt: Date.now(),
  //   })
  //   .run();
}
