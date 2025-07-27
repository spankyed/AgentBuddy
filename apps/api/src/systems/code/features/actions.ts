import { setup } from 'xstate'
import { emit } from '@/core/utils/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { actionQueries, actionCommands } from '@/systems/actions/repository'
import { EARS } from '@/core/types'
import type { ActionEntity } from '@/systems/actions/types'

const pluginId = 'code' as const
const busEvent = systemBus(pluginId)

// Incoming events from frontend
export const IncomingActionsEvents = [
  busEvent('codeActions.LIST', { page: z.number().optional() }),
  busEvent('codeActions.OPEN_ACTION', { actionId: z.string() }),
  busEvent('codeActions.SAVE_ACTION', { 
    actionId: z.string(),
    actionFn: z.string()
  }),
] as const

// Outgoing events to frontend
export type OutgoingActionsEvents = 
  | { type: 'codeActions.ACTIONS_LISTED'; data: { actions: ActionEntity[]; page: number; totalPages: number; totalCount: number } }
  | { type: 'codeActions.ACTION_SELECTED'; actionId: string; data: ActionEntity & { actionFnContent?: string } }
  | { type: 'codeActions.ACTION_UPDATED'; action: ActionEntity; actionId: string }
  | { type: 'codeActions.CODE_ERROR'; data: { message: string } }

export interface Context {
  // No local state needed for actions feature
}

export type Event = 
  | { type: 'codeActions.LIST'; page?: number }
  | { type: 'codeActions.OPEN_ACTION'; actionId: string }
  | { type: 'codeActions.SAVE_ACTION'; actionId: string; actionFn: string }
  | { type: 'CODE_STARTUP' };

export const actionsSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  actions: {
    listActions: ({ event }) => {
      const ev = event as { type: 'codeActions.LIST'; page?: number }
      const data = actionQueries.startupData(ev.page || 1)
      
      const wrapped = emit(pluginId, {
        type: 'codeActions.ACTIONS_LISTED',
        data
      })
      rootEvents.emitOutgoing(wrapped.event)
    },

    openAction: ({ event }) => {
      const ev = event as { type: 'codeActions.OPEN_ACTION'; actionId: string }
      const action = actionQueries.byId(ev.actionId as EARS.EntityId)
      
      if (action) {
        // Include the actionFn content directly
        const actionWithContent: ActionEntity & { actionFnContent?: string } = {
          ...action,
          actionFnContent: action.actionFn
        }
        
        const wrapped = emit(pluginId, {
          type: 'codeActions.ACTION_SELECTED',
          actionId: ev.actionId as EARS.EntityId,
          data: actionWithContent
        })
        rootEvents.emitOutgoing(wrapped.event)
      } else {
        const wrapped = emit(pluginId, {
          type: 'codeActions.CODE_ERROR',
          data: {
            message: `Action ${ev.actionId} not found`
          }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    saveAction: ({ event }) => {
      const ev = event as { type: 'codeActions.SAVE_ACTION'; actionId: string; actionFn: string }
      
      // Update the action with new actionFn
      const result = actionCommands.update(ev.actionId as EARS.EntityId, {
        actionFn: ev.actionFn
      })
      
      if (result.success) {
        const updatedAction = actionQueries.byId(ev.actionId as EARS.EntityId)
        if (updatedAction) {
          const wrapped = emit(pluginId, {
            type: 'codeActions.ACTION_UPDATED',
            action: updatedAction,
            actionId: updatedAction.id
          })
          rootEvents.emitOutgoing(wrapped.event)
        }
      } else {
        const wrapped = emit(pluginId, {
          type: 'codeActions.CODE_ERROR',
          data: {
            message: `Failed to update action: ${result.error || 'Unknown error'}`
          }
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    },

    sendStartupData: () => {
      // Send initial actions list on startup
      const data = actionQueries.startupData(1)
      
      const wrapped = emit(pluginId, {
        type: 'codeActions.ACTIONS_LISTED',
        data
      })
      rootEvents.emitOutgoing(wrapped.event)
    }
  }
}).createMachine({
  id: 'codeActions',
  initial: 'idle',
  context: {},
  states: {
    idle: {
      on: {
        'codeActions.LIST': {
          actions: 'listActions'
        },
        'codeActions.OPEN_ACTION': {
          actions: 'openAction'
        },
        'codeActions.SAVE_ACTION': {
          actions: 'saveAction'
        },
        'CODE_STARTUP': {
          actions: 'sendStartupData'
        }
      }
    }
  }
})