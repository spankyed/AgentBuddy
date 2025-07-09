import { assign, createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, safeEvents } from '@/shared/utils/actor-helpers';
import { EARS } from '@/shared/ears/types';
import { ActionsStartupData, ActionEntity } from './types';
import { actionsStartupData, getActionById, createAction, updateAction, deleteAction } from './repository';
import { z } from 'zod';
import { createLogger } from '@/systems/logs/logger';

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
  busEvent('FETCH_ACTIONS_PAGE', { page: z.number().optional() }),
] as const

export type ActionsInternalEvents = 
  | SystemEvents

export type OutgoingActionEvents =
  | { type: 'ACTIONS_STARTUP'; data: ActionsStartupData }
  | { type: 'ACTION_SELECTED'; actionId: EARS.EntityId; data: ActionEntity }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  | { type: 'ACTIONS_PAGE_LOADED'; data: { actions: ActionEntity[]; page: number; totalPages: number } }

export const ActionsSystemEvents = fromSystem(IncomingActionEvents)<OutgoingActionEvents, typeof actions>()
type ReceivableEvents = MergeReceivable<typeof IncomingActionEvents, ActionsInternalEvents>;

export const actionsSystem = setup({
  types: {
    context: {} as {
      actionsId: EARS.EntityId;
    },
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    sendActionsStartupData: ({ system }) => {
      system.get(bus).send(emit(actions, { 
        type: 'ACTIONS_STARTUP',
        data: actionsStartupData()
      }));
    },
    sendActionData: ({ system, event }) => {
      const ev = typeOf('ACTION_SELECT', event);
      const action = getActionById(ev.actionId as EARS.EntityId);
      
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
      const newAction = createAction({
        label: ev.label,
        input: ev.input,
        actionFn: ev.actionFn,
        output: ev.output,
        description: ev.description,
        category: ev.category
      });

      system.get(bus).send(emit(actions, {
        type: 'ACTION_CREATED',
        action: newAction,
        actionId: newAction.id,
      }));
    },
    updateAction: ({ system, event }) => {
      const ev = typeOf('UPDATE_ACTION', event);
      const updatedAction = updateAction(ev.actionId as EARS.EntityId, {
        label: ev.label,
        input: ev.input,
        actionFn: ev.actionFn,
        output: ev.output,
        description: ev.description,
        category: ev.category
      });

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
      const success = deleteAction(ev.actionId as EARS.EntityId);
      
      if (success) {
        system.get(bus).send(emit(actions, {
          type: 'ACTION_DELETED',
          actionId: ev.actionId as EARS.EntityId,
        }));
      }
    },
    fetchActionsPage: ({ system, event }) => {
      const ev = typeOf('FETCH_ACTIONS_PAGE', event);
      const data = actionsStartupData(ev.page || 1);
      
      system.get(bus).send(emit(actions, {
        type: 'ACTIONS_PAGE_LOADED',
        data: {
          actions: data.actions,
          page: data.page,
          totalPages: data.totalPages
        }
      }));
    },
  },
}).createMachine(
  {
    id: actions,
    initial: 'idle',
    context: ({ input }) => ({
      actionsId: input,
    }),
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