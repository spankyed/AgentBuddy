import { assign, createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/utils/actor-helpers';
import { EARS } from '@/core/types';
import { ActionsStartupData, ActionEntity } from './types';
import { actionQueries, actionCommands } from './repository';
import { z } from 'zod';
import { createLogger } from '@/core/utils/debug/logger';

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
      system.get(bus).send(emit(actions, { 
        type: 'ACTIONS_LISTED',
        data: actionQueries.startupData()
      }));
    },
    sendActionData: ({ system, event }) => {
      const ev = typeOf('ACTION_SELECT', event);
      const action = actionQueries.byId(ev.actionId as EARS.EntityId);
      
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
      const result = actionCommands.create({
        label: ev.label,
        parameters: ev.input,
        actionFn: ev.actionFn,
        output: ev.output,
        description: ev.description,
        category: ev.category
      });

      if (result.success) {
        system.get(bus).send(emit(actions, {
          type: 'ACTION_CREATED',
          action: result.data,
          actionId: result.data.id,
        }));
      } else {
        logger.error('Failed to create action:', { error: result.error });
      }
    },
    updateAction: ({ system, event }) => {
      const ev = typeOf('UPDATE_ACTION', event);
      const result = actionCommands.update(ev.actionId as EARS.EntityId, {
        label: ev.label,
        parameters: ev.input,
        actionFn: ev.actionFn,
        output: ev.output,
        description: ev.description,
        category: ev.category
      });

      if (result.success) {
        const updatedAction = actionQueries.byId(ev.actionId as EARS.EntityId);
        if (updatedAction) {
          system.get(bus).send(emit(actions, {
            type: 'ACTION_UPDATED',
            action: updatedAction,
            actionId: updatedAction.id,
          }));
        }
      } else {
        logger.error('Failed to update action:', { error: result.error });
      }
    },
    deleteAction: ({ system, event }) => {
      const ev = typeOf('DELETE_ACTION', event);
      const result = actionCommands.delete(ev.actionId as EARS.EntityId);
      
      if (result.success) {
        system.get(bus).send(emit(actions, {
          type: 'ACTION_DELETED',
          actionId: ev.actionId as EARS.EntityId,
        }));
      } else {
        logger.error('Failed to delete action:', { error: result.error });
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