import type { ActionTab } from '../../contract';
export type { ActionTab } from '../../contract';
import { setup , type ActorRefFrom } from 'xstate';
import { sendToSystem } from '@/__generated__/events';
import { updateParentState, getParentContext, addTabToParent } from '../../utils/parent-communication';
import type { ActionEntity } from '@abuddy/sdk';


export type Event =
  | { type: 'codeActions.OPEN_ACTION'; actionId: string }
  | { type: 'codeActions.SAVE_ACTION'; actionId: string; content: string }
  // Backend events
  | { type: 'codeActions.ACTION_SELECTED'; actionId: string; data: ActionEntity & { actionFnContent?: string } }
  | { type: 'codeActions.ACTION_UPDATED'; action: ActionEntity; actionId: string }
  // Tab restoration
  | { type: 'codeActions.OPEN_TABS'; actionIds: string[] };

export const actionsState = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as Event
  },
  actions: {
    openAction: ({ event }) => {
      const ev = event as { type: 'codeActions.OPEN_ACTION'; actionId: string }
      sendToSystem('code', { type: 'codeActions.OPEN_ACTION', actionId: ev.actionId })
    },

    saveAction: ({ event }) => {
      const ev = event as { type: 'codeActions.SAVE_ACTION'; actionId: string; content: string }
      sendToSystem('code', {
        type: 'codeActions.SAVE_ACTION',
        actionId: ev.actionId,
        actionFn: ev.content,
      })
    },

    handleActionSelected: ({ event, self }) => {
      const ev = event as { type: 'codeActions.ACTION_SELECTED'; actionId: string; data: ActionEntity & { actionFnContent?: string } }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      const actionPath = `action:${ev.actionId}`

      // Check if action tab already exists
      const existingTab = openFiles.find((f: any) => f.path === actionPath)

      if (existingTab) {
        // Tab already exists, just activate it
        updateParentState(self, {
          activeFilePath: actionPath
        })
      } else {
        // Create new action tab
        const actionTab: ActionTab = {
          path: actionPath,
          content: ev.data.actionFnContent || ev.data.actionFn || '',
          modified: false,
          isAction: true,
          actionEntity: ev.data
        }
        addTabToParent(self, actionTab, true)
      }
    },

    updateActionInOpenFiles: ({ event, self }) => {
      const ev = event as { type: 'codeActions.ACTION_UPDATED'; action: ActionEntity; actionId: string }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []

      // Update the action entity in the open tab
      const updatedFiles = openFiles.map((file: any) => {
        if (file.isAction && file.actionEntity.id === ev.actionId) {
          return {
            ...file,
            actionEntity: ev.action,
            modified: false
          }
        }
        return file
      })

      updateParentState(self, { openFiles: updatedFiles })
    },

    // Handle tab restoration
    openActionTabs: ({ event }) => {
      const ev = event as { type: 'codeActions.OPEN_TABS'; actionIds: string[] }
      // Open each action
      ev.actionIds.forEach(actionId => {
        sendToSystem('code', { type: 'codeActions.OPEN_ACTION', actionId })
      })
    }
  }
}).createMachine({
  id: 'codeActions',
  initial: 'idle',
  context: {},
  on: {
    'codeActions.OPEN_ACTION': {
      actions: 'openAction'
    },
    'codeActions.SAVE_ACTION': {
      actions: 'saveAction'
    },
    'codeActions.OPEN_TABS': {
      actions: 'openActionTabs'
    },
    // Backend events
    'codeActions.ACTION_SELECTED': {
      actions: 'handleActionSelected'
    },
    'codeActions.ACTION_UPDATED': {
      actions: 'updateActionInOpenFiles'
    }
  },
  states: {
    idle: {}
  }
})

/** The actions child's actor, named by whoever reads its context (`codeChild(…)`) */
export type CodeActionsActor = ActorRefFrom<typeof actionsState>;
