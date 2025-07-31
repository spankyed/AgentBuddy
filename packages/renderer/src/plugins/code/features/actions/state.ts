import { setup, assign } from 'xstate';
import { trpc } from '@/core/trpc';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs } from '../../utils/tab-management';
import type { ActionEntity } from '@app/api';

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

export interface Context {
  actions: ActionEntity[]
  page: number
  totalPages: number
  totalCount: number
  isLoading: boolean
  error: string | null
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
}

export type Event = 
  | { type: 'codeActions.LIST'; page?: number }
  | { type: 'codeActions.OPEN_ACTION'; actionId: string }
  | { type: 'codeActions.SAVE_ACTION'; actionId: string; content: string }
  | { type: 'codeActions.REFRESH_LIST' }
  // Backend events
  | { type: 'codeActions.ACTIONS_LISTED'; data: { actions: ActionEntity[]; page: number; totalPages: number; totalCount: number } }
  | { type: 'codeActions.ACTION_SELECTED'; actionId: string; data: ActionEntity & { actionFnContent?: string } }
  | { type: 'codeActions.ACTION_UPDATED'; action: ActionEntity; actionId: string }
  | { type: 'codeActions.CODE_ERROR'; data: { message: string } }
  // Tab restoration
  | { type: 'codeActions.OPEN_TABS'; actionIds: string[] };

export const actionsState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actions: {
    setLoading: assign({
      isLoading: true,
      error: null
    }),
    
    setError: assign({
      isLoading: false,
      error: ({ event }) => {
        const ev = event as { type: 'codeActions.CODE_ERROR'; data: { message: string } }
        return ev.data.message
      }
    }),
    
    listActions: ({ event }) => {
      const ev = event as { type: 'codeActions.LIST'; page?: number }
      sendToBackend('codeActions.LIST', { page: ev.page || 1 })
    },
    
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
    
    refreshList: () => {
      sendToBackend('codeActions.LIST', { page: 1 })
    },
    
    handleActionsStartup: assign({
      actions: ({ event }) => {
        const ev = event as { type: 'codeActions.ACTIONS_LISTED'; data: any }
        return ev.data.actions
      },
      page: ({ event }) => {
        const ev = event as { type: 'codeActions.ACTIONS_LISTED'; data: any }
        return ev.data.page
      },
      totalPages: ({ event }) => {
        const ev = event as { type: 'codeActions.ACTIONS_LISTED'; data: any }
        return ev.data.totalPages
      },
      totalCount: ({ event }) => {
        const ev = event as { type: 'codeActions.ACTIONS_LISTED'; data: any }
        return ev.data.totalCount
      },
      isLoading: false,
      error: null
    }),
    
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
    
    handleActionUpdated: assign({
      actions: ({ context, event }) => {
        const ev = event as { type: 'codeActions.ACTION_UPDATED'; action: ActionEntity; actionId: string }
        return context.actions.map(action => 
          action.id === ev.actionId ? ev.action : action
        )
      }
    }),
    
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
  id: 'actions',
  initial: 'idle',
  context: {
    actions: [],
    page: 1,
    totalPages: 1,
    totalCount: 0,
    isLoading: false,
    error: null
  },
  on: {
    'codeActions.LIST': {
      target: '.loading',
      actions: ['setLoading', 'listActions']
    },
    'codeActions.OPEN_ACTION': {
      actions: 'openAction'
    },
    'codeActions.SAVE_ACTION': {
      actions: 'saveAction'
    },
    'codeActions.REFRESH_LIST': {
      target: '.loading',
      actions: ['setLoading', 'refreshList']
    },
    'codeActions.OPEN_TABS': {
      actions: 'openActionTabs'
    },
    // Backend events
    'codeActions.ACTIONS_LISTED': {
      actions: 'handleActionsStartup'
    },
    'codeActions.ACTION_SELECTED': {
      actions: 'handleActionSelected'
    },
    'codeActions.ACTION_UPDATED': {
      actions: ['handleActionUpdated', 'updateActionInOpenFiles']
    },
    'codeActions.CODE_ERROR': {
      actions: 'setError'
    }
  },
  states: {
    idle: {
    },
    loading: {
      on: {
        'codeActions.ACTIONS_LISTED': {
          target: 'idle',
          actions: 'handleActionsStartup'
        },
        'codeActions.CODE_ERROR': {
          target: 'idle',
          actions: 'setError'
        }
      }
    }
  }
})