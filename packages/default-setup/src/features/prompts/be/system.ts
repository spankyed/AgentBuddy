import type { PromptsSettings } from '@/__generated__/types';
import { services } from '@/__generated__/services';
import { broadcastToPlugin } from '@/__generated__/events';
import { setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';

import { EARS } from '@/__generated__/ears';
import type { Contract } from './contract';
import { repository } from '@/__generated__/repository';
import { createLogger } from '@abuddy/sdk/logger';
import { toMap, toIdentifierSet, mapScalar } from '@abuddy/sdk/utils';
import { exportPrompts } from './repository/export-prompts';
import { ref } from '@/__generated__/ref';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const logger = createLogger('prompts');

export const promptsSpec = defineSystem<Contract>();

export const promptsSystem = setup({
  types: promptsSpec.types,
  actions: {
    sendPromptsConnectedData: () => {
      const connectedData = repository.promptQueries.connectedData();
      const promptsSettings = services.settings.forFeature<PromptsSettings>(ref('prompts'));
      
      broadcastToPlugin('prompts', { 
        type: 'PROMPTS_CONNECTED',
        data: {
          ...connectedData,
          categories: promptsSettings?.categories || []
        }
      });
    },
    sendPromptData: ({ event }) => {
      const ev = promptsSpec.typeOf('PROMPT_SELECT', event);
      const prompt = repository.promptQueries.byId(ev.promptId as EARS.EntityId);
      
      if (prompt) {
        broadcastToPlugin('prompts', {
          type: 'PROMPT_SELECTED',
          promptId: ev.promptId as EARS.EntityId,
          data: prompt
        });
      }
    },
    createPrompt: ({ event }) => {
      const ev = promptsSpec.typeOf('CREATE_PROMPT', event);
      const prompt = repository.promptCommands.create({
        label: ev.label,
        inputs: ev.inputs,
        templateFn: ev.templateFn,
        outputSchema: ev.outputSchema,
        description: ev.description,
        category: ev.category
      });

      broadcastToPlugin('prompts', {
        type: 'PROMPT_CREATED',
        prompt: prompt,
        promptId: prompt.id,
      });
    },
    updatePrompt: ({ event }) => {
      const ev = promptsSpec.typeOf('UPDATE_PROMPT', event);
      const updates: Record<string, any> = {};
      
      if (ev.label !== undefined) updates.label = ev.label;
      if (ev.inputs !== undefined) updates.inputs = ev.inputs;
      if (ev.templateFn !== undefined) updates.templateFn = ev.templateFn;
      if (ev.outputSchema !== undefined) updates.outputSchema = ev.outputSchema;
      if (ev.description !== undefined) updates.description = ev.description;
      if (ev.category !== undefined) updates.category = ev.category;
      
      repository.promptCommands.update(ev.promptId as EARS.EntityId, updates);

      const updatedPrompt = repository.promptQueries.byId(ev.promptId as EARS.EntityId);
      if (updatedPrompt) {
        broadcastToPlugin('prompts', {
          type: 'PROMPT_UPDATED',
          prompt: updatedPrompt,
          promptId: updatedPrompt.id,
        });
      }
    },
    deletePrompt: ({ event }) => {
      const ev = promptsSpec.typeOf('DELETE_PROMPT', event);
      repository.promptCommands.delete(ev.promptId as EARS.EntityId);
      
      broadcastToPlugin('prompts', {
        type: 'PROMPT_DELETED',
        promptId: ev.promptId as EARS.EntityId,
      });
    },
    fetchPromptsPage: ({ event }) => {
      const ev = promptsSpec.typeOf('FETCH_PROMPTS_PAGE', event);
      const data = repository.promptQueries.connectedData(ev.page || 1);

      broadcastToPlugin('prompts', {
        type: 'PROMPTS_PAGE_LOADED',
        data: {
          prompts: data.prompts,
          page: data.page,
          totalPages: data.totalPages
        }
      });
    },
    fetchAllPrompts: () => {
      const allPrompts = repository.promptQueries.all();
      broadcastToPlugin('prompts', {
        type: 'PROMPTS_ALL_LOADED',
        data: { prompts: allPrompts }
      });
    },
    importPrompts: ({ event }) => {
      const { prompts: importData } = promptsSpec.typeOf('IMPORT_PROMPTS', event);
      const pluginId = 'prompts' as const;

      logger.info('Importing prompts', { count: Array.isArray(importData) ? importData.length : 0 });

      if (!Array.isArray(importData)) {
        broadcastToPlugin(pluginId, {
          type: 'PROMPTS_IMPORT_FAILED',
          errors: ['Invalid import data: expected an array of prompts'],
        });
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
          });

          broadcastToPlugin(pluginId, {
            type: 'PROMPT_CREATED',
            prompt,
            promptId: prompt.id,
          });

          count++;
        } catch (err) {
          const message = errorMessage(err);
          errors.push(`Failed to create prompt "${item.label}": ${message}`);
        }
      }

      if (count === 0 && errors.length > 0) {
        broadcastToPlugin(pluginId, {
          type: 'PROMPTS_IMPORT_FAILED',
          errors,
        });
        return;
      }

      broadcastToPlugin(pluginId, {
        type: 'PROMPTS_IMPORTED',
        count,
        ...(errors.length > 0 ? { errors } : {}),
      });

      // Refresh the full prompts list
      const connectedData = repository.promptQueries.connectedData();
      const promptsSettings = services.settings.forFeature<PromptsSettings>(ref('prompts'));
      broadcastToPlugin(pluginId, {
        type: 'PROMPTS_CONNECTED',
        data: {
          ...connectedData,
          categories: promptsSettings?.categories || [],
        },
      });

      logger.info('Prompts import complete', { count, errors: errors.length });
    },

    exportPromptsToFile: ({ event }) => {
      const { directory } = promptsSpec.typeOf('EXPORT_PROMPTS', event);
      const pluginId = 'prompts' as const;

      logger.info('Exporting prompts', { directory });

      try {
        const { filePath, promptCount } = exportPrompts(directory);

        broadcastToPlugin(pluginId, {
          type: 'PROMPTS_EXPORTED',
          filePath,
          promptCount,
        });

        logger.info('Prompts export complete', { filePath, promptCount });
      } catch (error) {
        const message = errorMessage(error);
        logger.error('Prompts export failed', { error: message });

        broadcastToPlugin(pluginId, {
          type: 'PROMPTS_EXPORT_FAILED',
          errors: [message],
        });
      }
    },

    handleSettingsUpdate: ({ event }) => {
      const { changes } = promptsSpec.typeOf('FEATURE_SETTINGS_UPDATED', event);
      const categoryChanges = changes?.categories;
      
      if (!categoryChanges) return;
      
      const renames = toMap(categoryChanges.renames);
      // Categories use 'name' property as identifier
      const removed = toIdentifierSet(categoryChanges.removed, (item: any) => item.name);
      
      if (!renames.size && !removed.size) return;
      
      // Fallback to first available category or 'General'
      const emptyCategoryName = (): string | undefined => '';
      
      
      for (const p of repository.promptQueries.all()) {
        const nextCategory = mapScalar(p.category, renames, removed, emptyCategoryName);
        
        if (nextCategory !== p.category) {
          repository.promptCommands.update(p.id, { category: nextCategory });
          const updated = repository.promptQueries.byId(p.id);
          if (updated) {
            broadcastToPlugin('prompts', {
              type: 'PROMPT_UPDATED', 
              prompt: updated, 
              promptId: updated.id
            });
          }
        }
      }
    },
  },
}).createMachine(
  {
    id: 'prompts',
    initial: 'idle',
    context: () => ({}),
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
      FETCH_ALL_PROMPTS: {
        actions: 'fetchAllPrompts',
      },
      FEATURE_SETTINGS_UPDATED: {
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
          // A pack's seeds can add or change prompts
          PACK_CHANGED: {
            actions: 'sendPromptsConnectedData',
          },
        },
      },
    },
  }
);

const promptsEntry = { spec: promptsSpec, machine: promptsSystem };

export default promptsEntry;