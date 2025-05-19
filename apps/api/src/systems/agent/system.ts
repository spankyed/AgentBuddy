import { assign, fromPromise, log, raise, sendTo, setup } from 'xstate';
import { v4 as uuid } from 'uuid';
import { db, schema } from '@/db/client';
// import { LlmRunner } from '@/systems/agent/runner';
import agentPluginData from './mockData';
import type { MergeReceivable } from '@/shared/event-helpers';
import { fromSystem, systemBus } from '@/shared/event-helpers';
import { z } from 'zod';
import { bus } from '@/systems/backend';
import { emit, getActor, sendParentSafe } from '@/shared/actor-helpers';

export const agent = 'agent' as const;

const busEvent = systemBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { content: z.string() }),
  busEvent('CANCEL'),
] as const

export type AgentInternalEvents = 
  | { type: 'WAKEUP' }
  | { type: 'LLM_DONE' }
  | { type: 'TOKEN'; token: string }

export type OutgoingAgentEvents = 
  | { type: 'WAKEUP'; pluginData: typeof agentPluginData }
  | { type: 'ADD_ASSISTANT_MESSAGE'; content: string }
  | { type: 'LLM_DONE' }
  | { type: 'TOKEN'; token: string }

export interface AgentContext {
  model: string;
  userPrompt?: string;
  abortController?: AbortController;
}

export const AgentSystemEvents = fromSystem(IncomingAgentEvents)<OutgoingAgentEvents, typeof agent>()

export const agentSystem = setup({
  types: {
    context: {} as AgentContext,
    events: {} as MergeReceivable<typeof IncomingAgentEvents, AgentInternalEvents>,
  },
  actors: {
    delayedResponse: fromPromise<void, { content: string }>(async ({ input, system }) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      system.get(bus).send(emit(agent, { 
        type: 'ADD_ASSISTANT_MESSAGE', 
        content: input.content 
      }));
    })
  },
  actions: {
    sendFEWakeup: ({ system }) => {
      system.get(bus).send(emit(agent, { 
        type: 'WAKEUP',
        pluginData: agentPluginData
      }));
    },
    emitToken: ({ system }) => {
      system.get(bus).send(emit(agent, {
        type: 'TOKEN',
        token: 'some string'
      }));
    },
    storePrompt: assign({
      userPrompt: ({ event }) => (event.type === 'USER_MSG' ? event.content : undefined),
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
      model: 'gpt-4',
    },
    on: {
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
            actions: 'storePrompt',
          },
        },
      },
      processMessage: {
        invoke: {
          id: 'delayedResponse',
          src: 'delayedResponse',
          input: {
            content: "I'm analyzing your request to rewrite the code with CSS variables. Give me a moment to prepare a response."
          },
          onDone: {
            target: 'idle',
            // actions: 'emitToken',
          },
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
  const { userPrompt = '', model } = ctx;
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
