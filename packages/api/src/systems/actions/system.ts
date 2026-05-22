import { assign, createMachine, setup } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { bus, flows } from '@/core/system-ids';
import { emit } from '@/core/helpers/actor-helpers';
import { EARS } from '@/core/types';
import { ActionsStartupData, ActionEntity } from './types';
import { repository } from '@/repository';
import { createLogger } from '@/core/helpers/debug/logger';
import { toMap, toIdentifierSet, mapScalar } from '@/core/helpers/settings-changes';
import { exportActions } from './repository/export-actions';

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

type ActionsInternalEvents =
  | { type: 'ACTIONS_SETTINGS_UPDATED'; settings: any; changes?: any }

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

export const actionsDef = defineSystem('actions')<IncomingActionEvents | ActionsInternalEvents, OutgoingActionEvents>();
export const actions = actionsDef.id;

// Helper to broadcast action events to both actions and flows plugins
const broadcastActionEvent = (system: any, event: OutgoingActionEvents) => {
  const busSvc = system.get(bus);
  busSvc.send(emit(actions, event));
  busSvc.send(emit(flows, event));
};

export const actionsSystem = setup({
  types: actionsDef.types,
  actions: {
    sendActionsStartupData: ({ system }) => {
      const connectedData = repository.actionQueries.connectedData();
      const actionsSettings = repository.settingsQueries.getPluginSettings('actions');
      
      system.get(bus).send(emit(actions, { 
        type: 'ACTIONS_LISTED',
        data: {
          ...connectedData,
          categories: actionsSettings?.categories || []
        }
      }));
    },
    fetchActionsPage: ({ system, event }) => {
      const ev = actionsDef.typeOf('FETCH_ACTIONS_PAGE', event);
      const data = repository.actionQueries.connectedData(ev.page || 1);

      system.get(bus).send(emit(actions, {
        type: 'ACTIONS_PAGE_LOADED',
        data: {
          actions: data.actions,
          page: data.page,
          totalPages: data.totalPages
        }
      }));
    },
    fetchAllActions: ({ system }) => {
      const allActions = repository.actionQueries.all();
      system.get(bus).send(emit(actions, {
        type: 'ACTIONS_ALL_LOADED',
        data: { actions: allActions }
      }));
    },
    sendActionData: ({ system, event }) => {
      const ev = actionsDef.typeOf('ACTION_SELECT', event);
      const action = repository.actionQueries.byId(ev.actionId as EARS.EntityId);
      
      if (action) {
        system.get(bus).send(emit(actions, {
          type: 'ACTION_SELECTED',
          actionId: ev.actionId as EARS.EntityId,
          data: action
        }));
      }
    },
    createAction: ({ system, event }) => {
      const ev = actionsDef.typeOf('CREATE_ACTION', event);
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
      const ev = actionsDef.typeOf('UPDATE_ACTION', event);
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
      const ev = actionsDef.typeOf('DELETE_ACTION', event);
      repository.actionCommands.delete(ev.actionId as EARS.EntityId);

      broadcastActionEvent(system, {
        type: 'ACTION_DELETED',
        actionId: ev.actionId as EARS.EntityId,
      });
    },
    importActions: ({ system, event }) => {
      const { actions: importData } = actionsDef.typeOf('IMPORT_ACTIONS', event);
      const pluginId = actions;

      logger.info('Importing actions', { count: Array.isArray(importData) ? importData.length : 0 });

      if (!Array.isArray(importData)) {
        system.get(bus).send(emit(pluginId, {
          type: 'ACTIONS_IMPORT_FAILED',
          errors: ['Invalid import data: expected an array of actions'],
        }));
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
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to create action "${item.label}": ${message}`);
        }
      }

      if (count === 0 && errors.length > 0) {
        system.get(bus).send(emit(pluginId, {
          type: 'ACTIONS_IMPORT_FAILED',
          errors,
        }));
        return;
      }

      system.get(bus).send(emit(pluginId, {
        type: 'ACTIONS_IMPORTED',
        count,
        ...(errors.length > 0 ? { errors } : {}),
      }));

      // Refresh the full actions list
      const connectedData = repository.actionQueries.connectedData();
      const actionsSettings = repository.settingsQueries.getPluginSettings('actions');
      system.get(bus).send(emit(pluginId, {
        type: 'ACTIONS_LISTED',
        data: {
          ...connectedData,
          categories: actionsSettings?.categories || [],
        },
      }));

      logger.info('Actions import complete', { count, errors: errors.length });
    },

    exportActionsToFile: ({ system, event }) => {
      const { directory } = actionsDef.typeOf('EXPORT_ACTIONS', event);
      const pluginId = actions;

      logger.info('Exporting actions', { directory });

      try {
        const { filePath, actionCount } = exportActions(directory);

        system.get(bus).send(emit(pluginId, {
          type: 'ACTIONS_EXPORTED',
          filePath,
          actionCount,
        }));

        logger.info('Actions export complete', { filePath, actionCount });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Actions export failed', { error: message });

        system.get(bus).send(emit(pluginId, {
          type: 'ACTIONS_EXPORT_FAILED',
          errors: [message],
        }));
      }
    },

    handleSettingsUpdate: ({ system, event }) => {
      const { changes } = actionsDef.typeOf('ACTIONS_SETTINGS_UPDATED', event);
      // Handle nested changes format from detectAllArrayChanges
      const categoryChanges = changes?.categories || changes;
      
      if (!categoryChanges) return;
      
      const renames = toMap(categoryChanges.renames);
      // Categories use 'name' property as identifier
      const removed = toIdentifierSet(categoryChanges.removed, (item: any) => item.name);
      
      if (!renames.size && !removed.size) return;
      
      // Fallback to first available category or 'Utility'
      const firstCategoryName = (): string | undefined =>
        repository.settingsQueries.getPluginSettings('actions')?.categories?.[0]?.name || 'Utility';

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
    id: actions,
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
      ACTIONS_SETTINGS_UPDATED: {
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
        },
      },
    },
  }
);