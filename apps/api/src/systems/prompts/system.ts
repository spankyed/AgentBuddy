import { assign, createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, safeEvents } from '@/shared/utils/actor-helpers';
import { EARS } from '@/shared/ears/types';
import { PromptsStartupData, PromptEntity } from './types';
import { promptsStartupData, getPromptById, createPrompt, updatePrompt, deletePrompt } from './repository';
import { z } from 'zod';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('prompts');
const typeOf = safeEvents<ReceivableEvents>();

export const prompts = 'prompts' as const;

const busEvent = systemBus(prompts);

export const IncomingPromptEvents = [
  busEvent('PROMPT_SELECT', { promptId: z.string() }),
  busEvent('CREATE_PROMPT', { 
    label: z.string(),
    inputs: z.record(z.any()),
    templateFn: z.string(),
    outputSchema: z.any().optional(),
    description: z.string().optional(),
    category: z.string().optional()
  }),
  busEvent('UPDATE_PROMPT', { 
    promptId: z.string(),
    label: z.string().optional(),
    inputs: z.record(z.any()).optional(),
    templateFn: z.string().optional(),
    outputSchema: z.any().optional(),
    description: z.string().optional(),
    category: z.string().optional()
  }),
  busEvent('DELETE_PROMPT', { promptId: z.string() }),
  busEvent('FETCH_PROMPTS_PAGE', { page: z.number().optional() }),
] as const

export type PromptsInternalEvents = 
  | SystemEvents

export type OutgoingPromptEvents =
  | { type: 'PROMPTS_STARTUP'; data: PromptsStartupData }
  | { type: 'PROMPT_SELECTED'; promptId: EARS.EntityId; data: PromptEntity }
  | { type: 'PROMPT_CREATED'; prompt: PromptEntity; promptId: EARS.EntityId }
  | { type: 'PROMPT_UPDATED'; prompt: PromptEntity; promptId: EARS.EntityId }
  | { type: 'PROMPT_DELETED'; promptId: EARS.EntityId }
  | { type: 'PROMPTS_PAGE_LOADED'; data: { prompts: PromptEntity[]; page: number; totalPages: number } }

export const PromptsSystemEvents = fromSystem(IncomingPromptEvents)<OutgoingPromptEvents, typeof prompts>()
type ReceivableEvents = MergeReceivable<typeof IncomingPromptEvents, PromptsInternalEvents>;

export const promptsSystem = setup({
  types: {
    context: {} as {
      promptsId: EARS.EntityId;
    },
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    sendPromptsStartupData: ({ system }) => {
      system.get(bus).send(emit(prompts, { 
        type: 'PROMPTS_STARTUP',
        data: promptsStartupData()
      }));
    },
    sendPromptData: ({ system, event }) => {
      const ev = typeOf('PROMPT_SELECT', event);
      const prompt = getPromptById(ev.promptId as EARS.EntityId);
      
      if (prompt) {
        system.get(bus).send(emit(prompts, {
          type: 'PROMPT_SELECTED',
          promptId: ev.promptId as EARS.EntityId,
          data: prompt
        }));
      }
    },
    createPrompt: ({ system, event }) => {
      const ev = typeOf('CREATE_PROMPT', event);
      const newPrompt = createPrompt({
        label: ev.label,
        inputs: ev.inputs,
        templateFn: ev.templateFn,
        outputSchema: ev.outputSchema,
        description: ev.description,
        category: ev.category
      });

      system.get(bus).send(emit(prompts, {
        type: 'PROMPT_CREATED',
        prompt: newPrompt,
        promptId: newPrompt.id,
      }));
    },
    updatePrompt: ({ system, event }) => {
      const ev = typeOf('UPDATE_PROMPT', event);
      const updatedPrompt = updatePrompt(ev.promptId as EARS.EntityId, {
        label: ev.label,
        inputs: ev.inputs,
        templateFn: ev.templateFn,
        outputSchema: ev.outputSchema,
        description: ev.description,
        category: ev.category
      });

      if (updatedPrompt) {
        system.get(bus).send(emit(prompts, {
          type: 'PROMPT_UPDATED',
          prompt: updatedPrompt,
          promptId: updatedPrompt.id,
        }));
      }
    },
    deletePrompt: ({ system, event }) => {
      const ev = typeOf('DELETE_PROMPT', event);
      const success = deletePrompt(ev.promptId as EARS.EntityId);
      
      if (success) {
        system.get(bus).send(emit(prompts, {
          type: 'PROMPT_DELETED',
          promptId: ev.promptId as EARS.EntityId,
        }));
      }
    },
    fetchPromptsPage: ({ system, event }) => {
      const ev = typeOf('FETCH_PROMPTS_PAGE', event);
      const data = promptsStartupData(ev.page || 1);
      
      system.get(bus).send(emit(prompts, {
        type: 'PROMPTS_PAGE_LOADED',
        data: {
          prompts: data.prompts,
          page: data.page,
          totalPages: data.totalPages
        }
      }));
    },
  },
}).createMachine(
  {
    id: prompts,
    initial: 'idle',
    context: ({ input }) => ({
      promptsId: input,
    }),
    on: {
      PROMPT_SELECT: {
        actions: 'sendPromptData',
      },
      CREATE_PROMPT: {
        actions: 'createPrompt',
      },
      UPDATE_PROMPT: {
        actions: 'updatePrompt',
      },
      DELETE_PROMPT: {
        actions: 'deletePrompt',
      },
      FETCH_PROMPTS_PAGE: {
        actions: 'fetchPromptsPage',
      },
    },
    states: {
      idle: {
        on: {
          CLIENT_CONNECTED: {
            actions: 'sendPromptsStartupData',
          },
        },
      },
    },
  }
); 