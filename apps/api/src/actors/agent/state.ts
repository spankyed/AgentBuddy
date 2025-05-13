import { assign, setup } from 'xstate';
import { v4 as uuid } from 'uuid';
import { db, schema } from '@/db/client';
import { LlmRunner } from '@/actors/agent/runner';
import type { MergeReceivable } from '@/shared/event-helpers';
import { fromPlugin, pluginBus } from '@/shared/event-helpers';
import { z } from 'zod';
import { bus } from '@/actors/backend';
import { emit, getActor, sendParentSafe } from '@/shared/actor-helpers';

export const agent = 'agent' as const;

const busEvent = pluginBus(agent);

export const IncomingAgentEvents = [
  busEvent('USER_MSG', { content: z.string() }),
  busEvent('CANCEL'),
] as const

export type AgentInternalEvents = 
  | { type: 'LLM_DONE' }
  | { type: 'TOKEN'; token: string }

export type OutgoingAgentEvents = 
  | { type: 'LLM_DONE' }
  | { type: 'TOKEN'; token: string }

export interface AgentContext {
  model: string;
  userPrompt?: string;
  abortController?: AbortController;
}

export const AgentPluginEvents = fromPlugin(IncomingAgentEvents)<OutgoingAgentEvents, typeof agent>()

export const agentState = setup({
  types: {
    context: {} as AgentContext,
    events: {} as MergeReceivable<typeof IncomingAgentEvents, AgentInternalEvents>,
  },
  actions: {
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
    states: {
      idle: {
        on: {
          USER_MSG: {
            target: 'thinking',
            actions: 'storePrompt',
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
  const runner = new LlmRunner(model);

  for await (const token of runner.stream(userPrompt, { signal })) {
    // Persist & bubble up token events
    sendBack({ type: 'TOKEN', token });
  }

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
