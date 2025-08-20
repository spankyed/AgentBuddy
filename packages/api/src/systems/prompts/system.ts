import { assign, createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/utils/actor-helpers';
import { EARS } from '@/core/types';
import { PromptsStartupData, PromptEntity } from './types';
import { repository } from '@/repository';
import { z } from 'zod';
import { createLogger } from '@/core/utils/debug/logger';
import { settings as settingsSystemId } from '@/systems/settings/system';

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
  | { type: 'PROMPTS_SETTINGS_UPDATED'; settings: any; changes?: any }

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
    context: {} as {},
    events: {} as ReceivableEvents,
  },
  actions: {
    sendPromptsStartupData: ({ system }) => {
      const startupData = repository.promptQueries.startupData();
      const promptsSettings = repository.settingsQueries.getPluginSettings('prompts');
      
      system.get(bus).send(emit(prompts, { 
        type: 'PROMPTS_STARTUP',
        data: {
          ...startupData,
          categories: promptsSettings?.categories || []
        }
      }));
    },
    sendPromptData: ({ system, event }) => {
      const ev = typeOf('PROMPT_SELECT', event);
      const prompt = repository.promptQueries.byId(ev.promptId as EARS.EntityId);
      
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
      const result = repository.promptCommands.create({
        label: ev.label,
        inputs: ev.inputs,
        templateFn: ev.templateFn,
        description: ev.description,
        category: ev.category
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
      if (ev.templateFn !== undefined) updates.templateFn = ev.templateFn;
      if (ev.description !== undefined) updates.description = ev.description;
      if (ev.category !== undefined) updates.category = ev.category;
      
      const result = repository.promptCommands.update(ev.promptId as EARS.EntityId, updates);

      if (result.success) {
        const updatedPrompt = repository.promptQueries.byId(ev.promptId as EARS.EntityId);
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
      const result = repository.promptCommands.delete(ev.promptId as EARS.EntityId);
      
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
      const data = repository.promptQueries.startupData(ev.page || 1);
      
      system.get(bus).send(emit(prompts, {
        type: 'PROMPTS_PAGE_LOADED',
        data: {
          prompts: data.prompts,
          page: data.page,
          totalPages: data.totalPages
        }
      }));
    },
    handleSettingsUpdate: ({ system, event }) => {
      const { changes } = typeOf('PROMPTS_SETTINGS_UPDATED', event);
      if (!changes?.categoryRenames?.length) return;

      const renames = new Map<string, string>(
        changes.categoryRenames.map(
          ({ oldName, newName }: { oldName: string; newName: string }) => [oldName, newName]
        )
      );

      for (const p of repository.promptQueries.all()) {
        const prev = p.category;
        if (!prev) continue;
        const next = renames.get(prev);
        if (!next) continue;

        repository.promptCommands.update(p.id, { category: next });
        const updated = repository.promptQueries.byId(p.id);
        if (updated) system.get(bus).send(emit(prompts, {
          type: 'PROMPT_UPDATED', prompt: updated, promptId: updated.id
        }));
      }
    },
  },
}).createMachine(
  {
    id: prompts,
    initial: 'idle',
    context: ({ input }) => ({}),
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
      PROMPTS_SETTINGS_UPDATED: {
        actions: 'handleSettingsUpdate',
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