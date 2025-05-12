import { createMachine, assign, sendParent, setup } from 'xstate';
import { v4 as uuid } from 'uuid';
import { db, schema } from '../db/client';
import { LlmRunner } from '../llm/runner';

interface Ctx {
  sessionId: string;
  model: string;
  userPrompt?: string;
  abortController?: AbortController;
}

type Ev =
  | { type: 'USER_MSG'; content: string }
  | { type: 'LLM_DONE' }
  | { type: 'CANCEL' };

export const agentMachine = setup({
  types: {
    context: {} as Ctx,
    events: {} as Ev,
  },
  actions: {
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
    id: 'agent',
    initial: 'idle',
    context: {
      sessionId: '',
      model: 'gpt-4o',
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

async function runLlm(ctx: Ctx, signal: AbortSignal) {
  const { sessionId, userPrompt = '', model } = ctx;
  const runner = new LlmRunner(model);

  for await (const token of runner.stream(userPrompt, { signal })) {
    // Persist & bubble up token events
    sendParent({ type: 'TOKEN', token, sessionId });
  }

  sendParent({ type: 'LLM_DONE' });
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