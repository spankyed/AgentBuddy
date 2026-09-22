import { sendToPlugin } from '@/__generated__/events';
// Cross-plugin send: the flows plugin also receives action events
import { assign, createMachine, setup } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';

import { EARS } from '@/__generated__/ears';
import type { ActionsStartupData } from './types';
import { repository } from '@/__generated__/repository';
import { createLogger } from '@abuddy/sdk/logger';
import { toMap, toIdentifierSet, mapScalar } from '@abuddy/sdk/utils';
import { exportActions } from './repository/export-actions';
import type { ActionEntity } from '@abuddy/sdk';
import { ref } from '@/__generated__/ref';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const logger = createLogger('actions');

type IncomingActionEvents =
  | { type: 'ACTION_SELECT'; actionId: string }
  | { type: 'CREATE_ACTION'; label: string; input: Record<string, any>; actionFn: string; output?: any; description?: string; category?: string }
  | { type: 'UPDATE_ACTION'; actionId: string; label?: string; input?: Record<string, any>; actionFn?: string; output?: any; description?: string; category?: string }
  | { type: 'DELETE_ACTION'; actionId: string }
  | { type: 'FETCH_ACTIONS_PAGE'; page?: number }
  | { type: 'FETCH_ALL_ACTIONS' }
  | { type: 'IMPORT_ACTIONS'; actions: any }
  | { type: 'EXPORT_ACTIONS'; directory: string }

export type OutgoingActionEvents =
  | { type: 'ACTIONS_LISTED'; data: ActionsStartupData }
  | { type: 'ACTION_SELECTED'; actionId: EARS.EntityId; data: ActionEntity }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  | { type: 'ACTIONS_PAGE_LOADED'; data: { actions: ActionEntity[]; page: number; totalPages: number } }
  | { type: 'ACTIONS_ALL_LOADED'; data: { actions: ActionEntity[] } }
  | { type: 'ACTIONS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'ACTIONS_IMPORT_FAILED'; errors: string[] }
  | { type: 'ACTIONS_EXPORTED'; filePath: string; actionCount: number }
  | { type: 'ACTIONS_EXPORT_FAILED'; errors: string[] }

export const actionsSpec = defineSystem<IncomingActionEvents, OutgoingActionEvents>();

// Broadcasts action events to both the actions and flows plugins (abuddy.json sendsTo)
const broadcastActionEvent = (system: any, event: OutgoingActionEvents) => {
  sendToPlugin('actions', event);
  sendToPlugin('flows', event);
};

export const actionsSystem = setup({
  types: actionsSpec.types,
  actions: {
    sendActionsStartupData: ({ system }) => {
      const connectedData = repository.actionQueries.connectedData();
      const actionsSettings = repository.settingsQueries.getPluginSettings(ref('actions'));
      
      sendToPlugin('actions', { 
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

      sendToPlugin('actions', {
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
      sendToPlugin('actions', {
        type: 'ACTIONS_ALL_LOADED',
        data: { actions: allActions }
      });
    },
    sendActionData: ({ system, event }) => {
      const ev = actionsSpec.typeOf('ACTION_SELECT', event);
      const action = repository.actionQueries.byId(ev.actionId as EARS.EntityId);
      
      if (action) {
        sendToPlugin('actions', {
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
        sendToPlugin(pluginId, {
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
        sendToPlugin(pluginId, {
          type: 'ACTIONS_IMPORT_FAILED',
          errors,
        });
        return;
      }

      sendToPlugin(pluginId, {
        type: 'ACTIONS_IMPORTED',
        count,
        ...(errors.length > 0 ? { errors } : {}),
      });

      // Refresh the full actions list
      const connectedData = repository.actionQueries.connectedData();
      const actionsSettings = repository.settingsQueries.getPluginSettings(ref('actions'));
      sendToPlugin(pluginId, {
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

        sendToPlugin(pluginId, {
          type: 'ACTIONS_EXPORTED',
          filePath,
          actionCount,
        });

        logger.info('Actions export complete', { filePath, actionCount });
      } catch (error) {
        const message = errorMessage(error);
        logger.error('Actions export failed', { error: message });

        sendToPlugin(pluginId, {
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
        repository.settingsQueries.getPluginSettings(ref('actions'))?.categories?.[0]?.name || 'Utility';

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

const actionsEntry = { spec: actionsSpec, machine: actionsSystem } satisfies SystemEntry;

export default actionsEntry;