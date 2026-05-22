import { setup } from 'xstate'
import { emit } from '@/core/helpers/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { repository } from '@/repository'
import { EARS } from '@/core/types'
import type { ActionEntity } from '@/core/shared-types/actions'

const pluginId = 'code' as const

// Incoming events from frontend
export type IncomingActionsEvents =
  | { type: 'codeActions.OPEN_ACTION'; actionId: string }
  | { type: 'codeActions.SAVE_ACTION'; actionId: string; actionFn: string }

// Outgoing events to frontend
export type OutgoingActionsEvents =
  | { type: 'codeActions.ACTION_SELECTED'; actionId: string; data: ActionEntity & { actionFnContent?: string } }
  | { type: 'codeActions.ACTION_UPDATED'; action: ActionEntity; actionId: string }
  | { type: 'codeActions.CODE_ERROR'; data: { message: string } }

export interface Context {
  // No local state needed for actions feature
}

export type Event =
  | { type: 'codeActions.OPEN_ACTION'; actionId: string }
  | { type: 'codeActions.SAVE_ACTION'; actionId: string; actionFn: string };

export const actionsSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  actions: {
    openAction: ({ event }) => {
      const ev = event as { type: 'codeActions.OPEN_ACTION'; actionId: string }
      const action = repository.actionQueries.byId(ev.actionId as EARS.EntityId)

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
      repository.actionCommands.update(ev.actionId as EARS.EntityId, {
        actionFn: ev.actionFn
      })

      const updatedAction = repository.actionQueries.byId(ev.actionId as EARS.EntityId)
      if (updatedAction) {
        const wrapped = emit(pluginId, {
          type: 'codeActions.ACTION_UPDATED',
          action: updatedAction,
          actionId: updatedAction.id
        })
        rootEvents.emitOutgoing(wrapped.event)
      }
    }
  }
}).createMachine({
  id: 'codeActions',
  initial: 'idle',
  context: {},
  states: {
    idle: {
      on: {
        'codeActions.OPEN_ACTION': {
          actions: 'openAction'
        },
        'codeActions.SAVE_ACTION': {
          actions: 'saveAction'
        }
      }
    }
  }
})
