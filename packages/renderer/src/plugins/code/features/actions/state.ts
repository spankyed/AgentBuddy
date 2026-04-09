import { setup } from 'xstate';
import { trpc } from '@/core/trpc';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs } from '../../utils/tab-management';
import type { ActionEntity } from '@app/api';

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code',
    type: type,
    ...data
  })
}

export interface ActionTab {
  path: string
  content: string
  modified: boolean
  isAction: true
  actionEntity: ActionEntity
  // Include OpenFile properties to satisfy type constraints
  isDiff?: boolean
  externallyModified?: boolean
  externalModificationTime?: Date
  pendingSaveConflict?: boolean
  isPinned?: boolean
  groupId?: string
  isPreview?: boolean
}

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
      sendToBackend('codeActions.OPEN_ACTION', { actionId: ev.actionId })
    },

    saveAction: ({ event }) => {
      const ev = event as { type: 'codeActions.SAVE_ACTION'; actionId: string; content: string }
      sendToBackend('codeActions.SAVE_ACTION', {
        actionId: ev.actionId,
        actionFn: ev.content
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

        // Add to open files
        const { openFiles: updatedFiles, activeFilePath } = mergeTabs(openFiles, [actionTab], actionTab.path)

        updateParentState(self, {
          openFiles: updatedFiles,
          activeFilePath: activeFilePath
        })
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
        sendToBackend('codeActions.OPEN_ACTION', { actionId })
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
