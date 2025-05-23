// import { assign, fromPromise, log, raise, sendTo, setup } from 'xstate';
// import { v4 as uuid } from 'uuid';
// import { db, schema } from '@/db/client';
// // import { LlmRunner } from '@/systems/brain/runner';
// import type { MergeReceivable } from '@/shared/utils/event-helpers';
// import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
// import { z } from 'zod';
// import { bus } from '@/systems/backend';
// import { emit, getActor, sendParentSafe } from '@/shared/utils/actor-helpers';

// export const brain = 'brain' as const;

// const busEvent = systemBus(brain);

// export const IncomingBrainEvents = [
//   busEvent('USER_MSG', { content: z.string() }),
//   busEvent('CANCEL'),
// ] as const

// export type BrainInternalEvents = 
//   | { type: 'STARTUP' }
//   | { type: 'LLM_DONE' }
//   | { type: 'TOKEN'; token: string }

// export type OutgoingBrainEvents = 
//   | { type: 'STARTUP' }
//   | { type: 'ADD_ASSISTANT_MESSAGE'; content: string }
//   | { type: 'LLM_DONE' }
//   | { type: 'TOKEN'; token: string }

// export interface BrainContext {
//   model: string;
//   userPrompt?: string;
//   abortController?: AbortController;
// }

// export const BrainSystemEvents = fromSystem(IncomingBrainEvents)<OutgoingBrainEvents, typeof brain>()

// export const brainSystem = setup({
//   types: {
//     context: {} as BrainContext,
//     events: {} as MergeReceivable<typeof IncomingBrainEvents, BrainInternalEvents>,
//   },
//   actors: {
//     delayedResponse: fromPromise<void, { content: string }>(async ({ input, system }) => {
//       await new Promise(resolve => setTimeout(resolve, 1000));
//       system.get(bus).send(emit(brain, { 
//         type: 'ADD_ASSISTANT_MESSAGE', 
//         content: input.content 
//       }));
//     })
//   },
//   actions: {
//     sendFEWakeup: ({ system }) => {
//       system.get(bus).send(emit(brain, { type: 'STARTUP'}));
//     },
//     emitToken: ({ system }) => {
//       system.get(bus).send(emit(brain, {
//         type: 'TOKEN',
//         token: 'some string'
//       }));
//     },
//     storePrompt: assign({
//       userPrompt: ({ event }) => (event.type === 'USER_MSG' ? event.content : undefined),
//     }),
//     spawnLlmTask: assign(({ context }) => {
//       const abort = new AbortController();
//       runLlm(context, abort.signal);
//       return { abortController: abort };
//     }),
//     // abortLlm: (ctx) => ctx.abortController?.abort(),
//   },
// }).createMachine(
//   {
//     id: brain,
//     initial: 'idle',
//     context: {
//       model: 'gpt-4',
//     },
//     on: {
//       STARTUP: {
//         target: '.idle',
//         // actions: 'emitToken',
//         actions: 'sendFEWakeup',
//       },
//     },
//     states: {
//       idle: {
//         on: {
//           USER_MSG: {
//             target: 'processMessage',
//             actions: 'storePrompt',
//           },
//         },
//       },
//       processMessage: {
//         invoke: {
//           id: 'delayedResponse',
//           src: 'delayedResponse',
//           input: {
//             content: "I'm analyzing your request to rewrite the code with CSS variables. Give me a moment to prepare a response."
//           },
//           onDone: {
//             target: 'idle',
//             // actions: 'emitToken',
//           },
//         },
//       },
//       thinking: {
//         entry: ['spawnLlmTask'],
//         on: {
//           LLM_DONE: 'idle',
//           CANCEL: {
//             target: 'idle',
//             // actions: 'abortLlm',
//           },
//         },
//       },
//     },
//   }
// );

// const sendBack = sendParentSafe<BrainInternalEvents>();

// async function runLlm(ctx: BrainContext, signal: AbortSignal) {
//   const { userPrompt = '', model } = ctx;
//   // const runner = new LlmRunner(model);

//   // for await (const token of runner.stream(userPrompt, { signal })) {
//     // Persist & bubble up token events
//     // sendBack({ type: 'TOKEN', token });
//   // }

//   sendBack({ type: 'LLM_DONE' });
//   // Persist assistant message
//   // await db
//   //   .insert(schema.message)
//   //   .values({
//   //     id: uuid(),
//   //     sessionId,
//   //     sender: 'assistant',
//   //     content: runner.buffer(),
//   //     createdAt: Date.now(),
//   //   })
//   //   .run();
// }
