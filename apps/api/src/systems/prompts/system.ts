import { assign, createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, safeEvents } from '@/shared/utils/actor-helpers';
import { EARS } from '@/shared/ears/types';
import { PromptsStartupData, PromptEntity } from './types';
import { promptQueries, promptCommands } from './repository';
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
        data: promptQueries.startupData()
      }));
    },
    sendPromptData: ({ system, event }) => {
      const ev = typeOf('PROMPT_SELECT', event);
      const prompt = promptQueries.byId(ev.promptId as EARS.EntityId);
      
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
      const result = promptCommands.create({
        label: ev.label,
        inputs: ev.inputs,
        template: ev.templateFn,
        description: ev.description
      });

      if (result.success) {
        system.get(bus).send(emit(prompts, {
          type: 'PROMPT_CREATED',
          prompt: result.data,
          promptId: result.data.id,
        }));
      } else {
        logger.error('Failed to create prompt:', { error: result.error });
      }
    },
    updatePrompt: ({ system, event }) => {
      const ev = typeOf('UPDATE_PROMPT', event);
      const updates: Record<string, any> = {};
      
      if (ev.label !== undefined) updates.label = ev.label;
      if (ev.inputs !== undefined) updates.inputs = ev.inputs;
      if (ev.templateFn !== undefined) updates.template = ev.templateFn;
      if (ev.description !== undefined) updates.description = ev.description;
      
      const result = promptCommands.update(ev.promptId as EARS.EntityId, updates);

      if (result.success) {
        const updatedPrompt = promptQueries.byId(ev.promptId as EARS.EntityId);
        if (updatedPrompt) {
          system.get(bus).send(emit(prompts, {
            type: 'PROMPT_UPDATED',
            prompt: updatedPrompt,
            promptId: updatedPrompt.id,
          }));
        }
      } else {
        logger.error('Failed to update prompt:', { error: result.error });
      }
    },
    deletePrompt: ({ system, event }) => {
      const ev = typeOf('DELETE_PROMPT', event);
      const result = promptCommands.delete(ev.promptId as EARS.EntityId);
      
      if (result.success) {
        system.get(bus).send(emit(prompts, {
          type: 'PROMPT_DELETED',
          promptId: ev.promptId as EARS.EntityId,
        }));
      } else {
        logger.error('Failed to delete prompt:', { error: result.error });
      }
    },
    fetchPromptsPage: ({ system, event }) => {
      const ev = typeOf('FETCH_PROMPTS_PAGE', event);
      const data = promptQueries.startupData(ev.page || 1);
      
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