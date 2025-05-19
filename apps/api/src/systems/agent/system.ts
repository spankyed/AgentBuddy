import { assign, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import { v4 as uuid } from 'uuid';
import { db, schema } from '@/db/client';
import { chatStream, message } from '@/systems/agent/llm/runner';
import agentPluginData from './mockData';
import type { MergeReceivable } from '@/shared/event-helpers';
import { fromSystem, systemBus } from '@/shared/event-helpers';
import { z } from 'zod';
import { bus } from '@/systems/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/actor-helpers';

export const agent = 'agent' as const;

const busEvent = systemBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { content: z.string() }),
  busEvent('CANCEL'),
] as const

export type AgentInternalEvents = 
  | { type: 'WAKEUP' }
  | { type: 'LLM_DONE' }
  | { type: 'TOKEN_STREAM'; token: string }

export type OutgoingAgentEvents = 
  | { type: 'WAKEUP'; pluginData: typeof agentPluginData }
  | { type: 'ADD_ASSISTANT_MESSAGE'; content: string }
  | { type: 'LLM_DONE' }
  | { type: 'TOKEN_STREAM'; token: string }

export interface AgentContext {
  userPrompt?: string;
  abortController?: AbortController;
}

export const AgentSystemEvents = fromSystem(IncomingAgentEvents)<OutgoingAgentEvents, typeof agent>()
type ReceivableEvents = MergeReceivable<typeof IncomingAgentEvents, AgentInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

export const agentSystem = setup({
  types: {
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
    sendFEWakeup: ({ system }) => {
      system.get(bus).send(emit(agent, { 
        type: 'WAKEUP',
        pluginData: agentPluginData
      }));
    },
    storeUserMessage: assign({
      userPrompt: ({ event }) => typeOf('USER_MSG', event).content,
    }),
    spawnLlmTask: assign(({ context }) => {
      const abort = new AbortController();
      runLlm(context, abort.signal);
      return { abortController: abort };
    }),
    // abortLlm: (ctx) => ctx.abortController?.abort(),
  },
}).createMachine(
  {
    id: agent,
    initial: 'idle',
    context: {
      userPrompt: undefined,
    },
    on: {
      TOKEN_STREAM: {
        actions: 'sendToken',
      },
      WAKEUP: {
        target: '.idle',
        // actions: 'emitToken',
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
              message('user', context.userPrompt || '')
            ],
            provider: 'openai'
          }),
          onDone: {
            target: 'idle',
            actions: 'sendLLMDone',
          },
          onError: {
            target: 'idle',
          }
        },
      },
      thinking: {
        entry: ['spawnLlmTask'],
        on: {
          LLM_DONE: 'idle',
          CANCEL: {
            target: 'idle',
            // actions: 'abortLlm',
          },
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
