import { assign, createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/utils/actor-helpers';
import { EARS } from '@/core/types';
import { ActionsStartupData, ActionEntity } from './types';
import { repository } from '@/repository';
import { z } from 'zod';
import { createLogger } from '@/core/utils/debug/logger';
import { toMap, toIdentifierSet, mapScalar } from '@/systems/settings/settings-changes';

const logger = createLogger('actions');
const typeOf = safeEvents<ReceivableEvents>();

export const actions = 'actions' as const;

const busEvent = systemBus(actions);

export const IncomingActionEvents = [
  busEvent('ACTION_SELECT', { actionId: z.string() }),
  busEvent('CREATE_ACTION', { 
    label: z.string(),
    input: z.record(z.any()),
    actionFn: z.string(),
    output: z.any().optional(),
    description: z.string().optional(),
    category: z.string().optional()
  }),
  busEvent('UPDATE_ACTION', { 
    actionId: z.string(),
    label: z.string().optional(),
    input: z.record(z.any()).optional(),
    actionFn: z.string().optional(),
    output: z.any().optional(),
    description: z.string().optional(),
    category: z.string().optional()
  }),
  busEvent('DELETE_ACTION', { actionId: z.string() }),
] as const

export type ActionsInternalEvents = 
  | SystemEvents
  | { type: 'ACTIONS_SETTINGS_UPDATED'; settings: any; changes?: any }

export type OutgoingActionEvents =
  | { type: 'ACTIONS_LISTED'; data: ActionsStartupData }
  | { type: 'ACTION_SELECTED'; actionId: EARS.EntityId; data: ActionEntity }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }

export const ActionsSystemEvents = fromSystem(IncomingActionEvents)<OutgoingActionEvents, typeof actions>()
type ReceivableEvents = MergeReceivable<typeof IncomingActionEvents, ActionsInternalEvents>;

export const actionsSystem = setup({
  types: {
    context: {} as {},
    events: {} as ReceivableEvents,
  },
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
    sendActionData: ({ system, event }) => {
      const ev = typeOf('ACTION_SELECT', event);
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
      const ev = typeOf('CREATE_ACTION', event);
      
      const action = repository.actionCommands.create({
        label: ev.label,
        input: ev.input,
        actionFn: ev.actionFn,
        output: ev.output,
        description: ev.description,
        category: ev.category
      });

      system.get(bus).send(emit(actions, {
        type: 'ACTION_CREATED',
        action: action,
        actionId: action.id,
      }));
    },
    updateAction: ({ system, event }) => {
      const ev = typeOf('UPDATE_ACTION', event);
      
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
        system.get(bus).send(emit(actions, {
          type: 'ACTION_UPDATED',
          action: updatedAction,
          actionId: updatedAction.id,
        }));
      }
    },
    deleteAction: ({ system, event }) => {
      const ev = typeOf('DELETE_ACTION', event);
      repository.actionCommands.delete(ev.actionId as EARS.EntityId);
      
      system.get(bus).send(emit(actions, {
        type: 'ACTION_DELETED',
        actionId: ev.actionId as EARS.EntityId,
      }));
    },
    handleSettingsUpdate: ({ system, event }) => {
      const { changes } = typeOf('ACTIONS_SETTINGS_UPDATED', event);
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
      
      const busSvc = system.get(bus);
      
      for (const a of repository.actionQueries.all()) {
        const nextCategory = mapScalar(a.category, renames, removed, firstCategoryName);
        
        if (nextCategory !== a.category) {
          repository.actionCommands.update(a.id, { category: nextCategory });
          const updated = repository.actionQueries.byId(a.id);
          if (updated) {
            busSvc.send(emit(actions, {
              type: 'ACTION_UPDATED', 
              action: updated, 
              actionId: updated.id
            }));
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
      ACTIONS_SETTINGS_UPDATED: {
        actions: 'handleSettingsUpdate',
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