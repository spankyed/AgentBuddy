import { assign, createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/core/helpers/event-helpers';
import { fromSystem, systemBus } from '@/core/helpers/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/helpers/actor-helpers';
import { EARS } from '@/core/types';
import { PromptsConnectedData, PromptEntity } from './types';
import { repository } from '@/repository';
import { z } from 'zod';
import { createLogger } from '@/core/helpers/debug/logger';
import { settings as settingsSystemId } from '@/systems/settings/system';
import { toMap, toIdentifierSet, mapScalar } from '@/systems/settings/settings-changes';
import { exportPrompts } from './repository/export-prompts';

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
  busEvent('IMPORT_PROMPTS', { prompts: z.any() }),
  busEvent('EXPORT_PROMPTS', { directory: z.string() }),
] as const

export type PromptsInternalEvents = 
  | SystemEvents
  | { type: 'PROMPTS_SETTINGS_UPDATED'; settings: any; changes?: any }

export type OutgoingPromptEvents =
  | { type: 'PROMPTS_CONNECTED'; data: PromptsConnectedData }
  | { type: 'PROMPT_SELECTED'; promptId: EARS.EntityId; data: PromptEntity }
  | { type: 'PROMPT_CREATED'; prompt: PromptEntity; promptId: EARS.EntityId }
  | { type: 'PROMPT_UPDATED'; prompt: PromptEntity; promptId: EARS.EntityId }
  | { type: 'PROMPT_DELETED'; promptId: EARS.EntityId }
  | { type: 'PROMPTS_PAGE_LOADED'; data: { prompts: PromptEntity[]; page: number; totalPages: number } }
  | { type: 'PROMPTS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'PROMPTS_IMPORT_FAILED'; errors: string[] }
  | { type: 'PROMPTS_EXPORTED'; filePath: string; promptCount: number }
  | { type: 'PROMPTS_EXPORT_FAILED'; errors: string[] }

export const PromptsSystemEvents = fromSystem(IncomingPromptEvents)<OutgoingPromptEvents, typeof prompts>()
type ReceivableEvents = MergeReceivable<typeof IncomingPromptEvents, PromptsInternalEvents>;

export const promptsSystem = setup({
  types: {
    context: {} as {},
    events: {} as ReceivableEvents,
  },
  actions: {
    sendPromptsConnectedData: ({ system }) => {
      const connectedData = repository.promptQueries.connectedData();
      const promptsSettings = repository.settingsQueries.getPluginSettings('prompts');
      
      system.get(bus).send(emit(prompts, { 
        type: 'PROMPTS_CONNECTED',
        data: {
          ...connectedData,
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
      const prompt = repository.promptCommands.create({
        label: ev.label,
        inputs: ev.inputs,
        templateFn: ev.templateFn,
        description: ev.description,
        category: ev.category
      });

      system.get(bus).send(emit(prompts, {
        type: 'PROMPT_CREATED',
        prompt: prompt,
        promptId: prompt.id,
      }));
    },
    updatePrompt: ({ system, event }) => {
      const ev = typeOf('UPDATE_PROMPT', event);
      const updates: Record<string, any> = {};
      
      if (ev.label !== undefined) updates.label = ev.label;
      if (ev.inputs !== undefined) updates.inputs = ev.inputs;
      if (ev.templateFn !== undefined) updates.templateFn = ev.templateFn;
      if (ev.description !== undefined) updates.description = ev.description;
      if (ev.category !== undefined) updates.category = ev.category;
      
      repository.promptCommands.update(ev.promptId as EARS.EntityId, updates);

      const updatedPrompt = repository.promptQueries.byId(ev.promptId as EARS.EntityId);
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
      repository.promptCommands.delete(ev.promptId as EARS.EntityId);
      
      system.get(bus).send(emit(prompts, {
        type: 'PROMPT_DELETED',
        promptId: ev.promptId as EARS.EntityId,
      }));
    },
    fetchPromptsPage: ({ system, event }) => {
      const ev = typeOf('FETCH_PROMPTS_PAGE', event);
      const data = repository.promptQueries.connectedData(ev.page || 1);
      
      system.get(bus).send(emit(prompts, {
        type: 'PROMPTS_PAGE_LOADED',
        data: {
          prompts: data.prompts,
          page: data.page,
          totalPages: data.totalPages
        }
      }));
    },
    importPrompts: ({ system, event }) => {
      const { prompts: importData } = typeOf('IMPORT_PROMPTS', event);
      const pluginId = prompts;

      logger.info('Importing prompts', { count: Array.isArray(importData) ? importData.length : 0 });

      if (!Array.isArray(importData)) {
        system.get(bus).send(emit(pluginId, {
          type: 'PROMPTS_IMPORT_FAILED',
          errors: ['Invalid import data: expected an array of prompts'],
        }));
        return;
      }

      const errors: string[] = [];
      let count = 0;

      for (let i = 0; i < importData.length; i++) {
        const item = importData[i];
        if (!item.label || !item.templateFn) {
          errors.push(`Prompt at index ${i} is missing required fields (label, templateFn)`);
          continue;
        }

        try {
          const prompt = repository.promptCommands.create({
            label: item.label,
            inputs: item.inputs || {},
            templateFn: item.templateFn,
            outputSchema: item.outputSchema,
            description: item.description,
            category: item.category,
          } as any);

          system.get(bus).send(emit(pluginId, {
            type: 'PROMPT_CREATED',
            prompt,
            promptId: prompt.id,
          }));

          count++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to create prompt "${item.label}": ${message}`);
        }
      }

      if (count === 0 && errors.length > 0) {
        system.get(bus).send(emit(pluginId, {
          type: 'PROMPTS_IMPORT_FAILED',
          errors,
        }));
        return;
      }

      system.get(bus).send(emit(pluginId, {
        type: 'PROMPTS_IMPORTED',
        count,
        ...(errors.length > 0 ? { errors } : {}),
      }));

      // Refresh the full prompts list
      const connectedData = repository.promptQueries.connectedData();
      const promptsSettings = repository.settingsQueries.getPluginSettings('prompts');
      system.get(bus).send(emit(pluginId, {
        type: 'PROMPTS_CONNECTED',
        data: {
          ...connectedData,
          categories: promptsSettings?.categories || [],
        },
      }));

      logger.info('Prompts import complete', { count, errors: errors.length });
    },

    exportPromptsToFile: ({ system, event }) => {
      const { directory } = typeOf('EXPORT_PROMPTS', event);
      const pluginId = prompts;

      logger.info('Exporting prompts', { directory });

      try {
        const { filePath, promptCount } = exportPrompts(directory);

        system.get(bus).send(emit(pluginId, {
          type: 'PROMPTS_EXPORTED',
          filePath,
          promptCount,
        }));

        logger.info('Prompts export complete', { filePath, promptCount });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Prompts export failed', { error: message });

        system.get(bus).send(emit(pluginId, {
          type: 'PROMPTS_EXPORT_FAILED',
          errors: [message],
        }));
      }
    },

    handleSettingsUpdate: ({ system, event }) => {
      const { changes } = typeOf('PROMPTS_SETTINGS_UPDATED', event);
      // Handle nested changes format from detectAllArrayChanges
      const categoryChanges = changes?.categories || changes;
      
      if (!categoryChanges) return;
      
      const renames = toMap(categoryChanges.renames);
      // Categories use 'name' property as identifier
      const removed = toIdentifierSet(categoryChanges.removed, (item: any) => item.name);
      
      if (!renames.size && !removed.size) return;
      
      // Fallback to first available category or 'General'
      const emptyCategoryName = (): string | undefined => '';
      
      const busSvc = system.get(bus);
      
      for (const p of repository.promptQueries.all()) {
        const nextCategory = mapScalar(p.category, renames, removed, emptyCategoryName);
        
        if (nextCategory !== p.category) {
          repository.promptCommands.update(p.id, { category: nextCategory });
          const updated = repository.promptQueries.byId(p.id);
          if (updated) {
            busSvc.send(emit(prompts, {
              type: 'PROMPT_UPDATED', 
              prompt: updated, 
              promptId: updated.id
            }));
          }
        }
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
      IMPORT_PROMPTS: {
        actions: 'importPrompts',
      },
      EXPORT_PROMPTS: {
        actions: 'exportPromptsToFile',
      },
    },
    states: {
      idle: {
        on: {
          CLIENT_CONNECTED: {
            actions: 'sendPromptsConnectedData',
          },
        },
      },
    },
  }
); 