import type { ActionsSettings } from '@/__generated__/types';
import { services } from '@/__generated__/services';
import { broadcastToPlugin } from '@/__generated__/events';
// Cross-plugin send: the flows plugin also receives action events
import { assign, createMachine, setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';

import { EARS } from '@/__generated__/ears';
import type { Contract } from './contract';
import type { ActionsStartupData, OutgoingActionEvents } from './types';
import { repository } from '@/__generated__/repository';
import { createLogger } from '@abuddy/sdk/logger';
import { toMap, toIdentifierSet, mapScalar } from '@abuddy/sdk/utils';
import { exportActions } from './repository/export-actions';
import type { ActionEntity } from '@abuddy/sdk';
import { ref } from '@/__generated__/ref';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const logger = createLogger('actions');

export const actionsSpec = defineSystem<Contract>();

/**
 * Broadcasts an action event to the actions plugin, and to the flows plugin the three it declares it takes: the
 * flows editor keeps its action list current from these. The other eight are between this system and its own
 * plugin, so narrowing here is what the contract asks for rather than a special case.
 */
const FLOWS_TAKES = ['ACTION_CREATED', 'ACTION_UPDATED', 'ACTION_DELETED'] as const;
type FlowsAction = Extract<OutgoingActionEvents, { type: (typeof FLOWS_TAKES)[number] }>;
const broadcastActionEvent = (system: any, event: OutgoingActionEvents) => {
  broadcastToPlugin('actions', event);
  if ((FLOWS_TAKES as readonly string[]).includes(event.type)) broadcastToPlugin('flows', event as FlowsAction);
};

export const actionsSystem = setup({
  types: actionsSpec.types,
  actions: {
    sendActionsStartupData: ({ system }) => {
      const connectedData = repository.actionQueries.connectedData();
      const actionsSettings = services.settings.forFeature<ActionsSettings>(ref('actions'));
      
      broadcastToPlugin('actions', { 
        type: 'ACTIONS_LISTED',
        data: {
          ...connectedData,
          categories: actionsSettings?.categories || []
        }
      });
    },
    fetchActionsPage: ({ system, event }) => {
      const ev = actionsSpec.typeOf('FETCH_ACTIONS_PAGE', event);
      const data = repository.actionQueries.connectedData(ev.page || 1);

      broadcastToPlugin('actions', {
        type: 'ACTIONS_PAGE_LOADED',
        data: {
          actions: data.actions,
          page: data.page,
          totalPages: data.totalPages
        }
      });
    },
    fetchAllActions: ({ system }) => {
      const allActions = repository.actionQueries.all();
      broadcastToPlugin('actions', {
        type: 'ACTIONS_ALL_LOADED',
        data: { actions: allActions }
      });
    },
    sendActionData: ({ system, event }) => {
      const ev = actionsSpec.typeOf('ACTION_SELECT', event);
      const action = repository.actionQueries.byId(ev.actionId as EARS.EntityId);
      
      if (action) {
        broadcastToPlugin('actions', {
          type: 'ACTION_SELECTED',
          actionId: ev.actionId as EARS.EntityId,
          data: action
        });
      }
    },
    createAction: ({ system, event }) => {
      const ev = actionsSpec.typeOf('CREATE_ACTION', event);
      const action = repository.actionCommands.create({
        label: ev.label,
        input: ev.input,
        actionFn: ev.actionFn,
        output: ev.output,
        description: ev.description,
        category: ev.category
      });

      broadcastActionEvent(system, {
        type: 'ACTION_CREATED',
        action,
        actionId: action.id,
      });
    },
    updateAction: ({ system, event }) => {
      const ev = actionsSpec.typeOf('UPDATE_ACTION', event);
      repository.actionCommands.update(ev.actionId as EARS.EntityId, {
        label: ev.label,
        input: ev.input,
        actionFn: ev.actionFn,
        output: ev.output,
        description: ev.description,
        category: ev.category
      });

      const updatedAction = repository.actionQueries.byId(ev.actionId as EARS.EntityId);
      if (updatedAction) {
        broadcastActionEvent(system, {
          type: 'ACTION_UPDATED',
          action: updatedAction,
          actionId: updatedAction.id,
        });
      }
    },
    deleteAction: ({ system, event }) => {
      const ev = actionsSpec.typeOf('DELETE_ACTION', event);
      repository.actionCommands.delete(ev.actionId as EARS.EntityId);

      broadcastActionEvent(system, {
        type: 'ACTION_DELETED',
        actionId: ev.actionId as EARS.EntityId,
      });
    },
    importActions: ({ system, event }) => {
      const { actions: importData } = actionsSpec.typeOf('IMPORT_ACTIONS', event);
      const pluginId = 'actions' as const;

      logger.info('Importing actions', { count: Array.isArray(importData) ? importData.length : 0 });

      if (!Array.isArray(importData)) {
        broadcastToPlugin(pluginId, {
          type: 'ACTIONS_IMPORT_FAILED',
          errors: ['Invalid import data: expected an array of actions'],
        });
        return;
      }

      const errors: string[] = [];
      let count = 0;

      for (let i = 0; i < importData.length; i++) {
        const item = importData[i];
        if (!item.label || !item.actionFn) {
          errors.push(`Action at index ${i} is missing required fields (label, actionFn)`);
          continue;
        }

        try {
          const action = repository.actionCommands.create({
            label: item.label,
            input: item.input || {},
            actionFn: item.actionFn,
            output: item.output,
            description: item.description,
            category: item.category,
          });

          broadcastActionEvent(system, {
            type: 'ACTION_CREATED',
            action,
            actionId: action.id,
          });

          count++;
        } catch (err) {
          const message = errorMessage(err);
          errors.push(`Failed to create action "${item.label}": ${message}`);
        }
      }

      if (count === 0 && errors.length > 0) {
        broadcastToPlugin(pluginId, {
          type: 'ACTIONS_IMPORT_FAILED',
          errors,
        });
        return;
      }

      broadcastToPlugin(pluginId, {
        type: 'ACTIONS_IMPORTED',
        count,
        ...(errors.length > 0 ? { errors } : {}),
      });

      // Refresh the full actions list
      const connectedData = repository.actionQueries.connectedData();
      const actionsSettings = services.settings.forFeature<ActionsSettings>(ref('actions'));
      broadcastToPlugin(pluginId, {
        type: 'ACTIONS_LISTED',
        data: {
          ...connectedData,
          categories: actionsSettings?.categories || [],
        },
      });

      logger.info('Actions import complete', { count, errors: errors.length });
    },

    exportActionsToFile: ({ system, event }) => {
      const { directory } = actionsSpec.typeOf('EXPORT_ACTIONS', event);
      const pluginId = 'actions' as const;

      logger.info('Exporting actions', { directory });

      try {
        const { filePath, actionCount } = exportActions(directory);

        broadcastToPlugin(pluginId, {
          type: 'ACTIONS_EXPORTED',
          filePath,
          actionCount,
        });

        logger.info('Actions export complete', { filePath, actionCount });
      } catch (error) {
        const message = errorMessage(error);
        logger.error('Actions export failed', { error: message });

        broadcastToPlugin(pluginId, {
          type: 'ACTIONS_EXPORT_FAILED',
          errors: [message],
        });
      }
    },

    handleSettingsUpdate: ({ system, event }) => {
      const { changes } = actionsSpec.typeOf('FEATURE_SETTINGS_UPDATED', event);
      const categoryChanges = changes?.categories;
      
      if (!categoryChanges) return;
      
      const renames = toMap(categoryChanges.renames);
      // Categories use 'name' property as identifier
      const removed = toIdentifierSet(categoryChanges.removed, (item: any) => item.name);
      
      if (!renames.size && !removed.size) return;
      
      // Fallback to first available category or 'Utility'
      const firstCategoryName = (): string | undefined =>
        services.settings.forFeature<ActionsSettings>(ref('actions'))?.categories?.[0]?.name || 'Utility';

      for (const a of repository.actionQueries.all()) {
        const nextCategory = mapScalar(a.category, renames, removed, firstCategoryName);

        if (nextCategory !== a.category) {
          repository.actionCommands.update(a.id, { category: nextCategory });
          const updated = repository.actionQueries.byId(a.id);
          if (updated) {
            broadcastActionEvent(system, {
              type: 'ACTION_UPDATED',
              action: updated,
              actionId: updated.id
            });
          }
        }
      }
    },
  },
}).createMachine(
  {
    id: 'actions',
    initial: 'idle',
    context: ({ input }) => ({}),
    on: {
      ACTION_SELECT: {
        actions: 'sendActionData',
      },
      CREATE_ACTION: {
        actions: 'createAction',
      },
      UPDATE_ACTION: {
        actions: 'updateAction',
      },
      DELETE_ACTION: {
        actions: 'deleteAction',
      },
      FETCH_ACTIONS_PAGE: {
        actions: 'fetchActionsPage',
      },
      FETCH_ALL_ACTIONS: {
        actions: 'fetchAllActions',
      },
      FEATURE_SETTINGS_UPDATED: {
        actions: 'handleSettingsUpdate',
      },
      IMPORT_ACTIONS: {
        actions: 'importActions',
      },
      EXPORT_ACTIONS: {
        actions: 'exportActionsToFile',
      },
    },
    states: {
      idle: {
        on: {
          CLIENT_CONNECTED: {
            actions: 'sendActionsStartupData',
          },
          // A pack's seeds can add or change actions
          PACK_CHANGED: {
            actions: 'sendActionsStartupData',
          },
        },
      },
    },
  }
);

const actionsEntry = { spec: actionsSpec, machine: actionsSystem };

export default actionsEntry;