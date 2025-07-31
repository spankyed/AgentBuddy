import { setup, assign } from 'xstate';
import { trpc } from '@/core/trpc';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs } from '../../utils/tab-management';
import type { PromptEntity } from '@app/api';

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
}

export interface Context {
  prompts: PromptEntity[]
  page: number
  totalPages: number
  totalCount: number
  isLoading: boolean
  error: string | null
}

export interface PromptTab {
  path: string
  content: string
  modified: boolean
  isPrompt: true
  promptEntity: PromptEntity
  // Include OpenFile properties to satisfy type constraints
  isDiff?: boolean
  externallyModified?: boolean
  externalModificationTime?: Date
  pendingSaveConflict?: boolean
}

export type Event = 
  | { type: 'codePrompts.LIST'; page?: number }
  | { type: 'codePrompts.OPEN_PROMPT'; promptId: string }
  | { type: 'codePrompts.SAVE_PROMPT'; promptId: string; content: string }
  | { type: 'codePrompts.REFRESH_LIST' }
  // Backend events
  | { type: 'codePrompts.PROMPTS_LISTED'; data: { prompts: PromptEntity[]; page: number; totalPages: number; totalCount: number } }
  | { type: 'codePrompts.PROMPT_SELECTED'; promptId: string; data: PromptEntity & { templateFnContent?: string } }
  | { type: 'codePrompts.PROMPT_UPDATED'; prompt: PromptEntity; promptId: string }
  | { type: 'codePrompts.CODE_ERROR'; data: { message: string } }
  // Tab restoration
  | { type: 'codePrompts.OPEN_TABS'; promptIds: string[] };

export const promptsState = setup({
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
        const ev = event as { type: 'codePrompts.CODE_ERROR'; data: { message: string } }
        return ev.data.message
      }
    }),
    
    listPrompts: ({ event }) => {
      const ev = event as { type: 'codePrompts.LIST'; page?: number }
      sendToBackend('codePrompts.LIST', { page: ev.page || 1 })
    },
    
    openPrompt: ({ event }) => {
      const ev = event as { type: 'codePrompts.OPEN_PROMPT'; promptId: string }
      sendToBackend('codePrompts.OPEN_PROMPT', { promptId: ev.promptId })
    },
    
    savePrompt: ({ event }) => {
      const ev = event as { type: 'codePrompts.SAVE_PROMPT'; promptId: string; content: string }
      sendToBackend('codePrompts.SAVE_PROMPT', { 
        promptId: ev.promptId,
        templateFn: ev.content 
      })
    },
    
    refreshList: () => {
      sendToBackend('codePrompts.LIST', { page: 1 })
    },
    
    handlePromptsListed: assign({
      prompts: ({ event }) => {
        const ev = event as { type: 'codePrompts.PROMPTS_LISTED'; data: any }
        return ev.data.prompts
      },
      page: ({ event }) => {
        const ev = event as { type: 'codePrompts.PROMPTS_LISTED'; data: any }
        return ev.data.page
      },
      totalPages: ({ event }) => {
        const ev = event as { type: 'codePrompts.PROMPTS_LISTED'; data: any }
        return ev.data.totalPages
      },
      totalCount: ({ event }) => {
        const ev = event as { type: 'codePrompts.PROMPTS_LISTED'; data: any }
        return ev.data.totalCount
      },
      isLoading: false,
      error: null
    }),
    
    handlePromptSelected: ({ event, self }) => {
      const ev = event as { type: 'codePrompts.PROMPT_SELECTED'; promptId: string; data: PromptEntity & { templateFnContent?: string } }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      const promptPath = `prompt:${ev.promptId}`
      
      // Check if prompt tab already exists
      const existingTab = openFiles.find((f: any) => f.path === promptPath)
      
      if (existingTab) {
        // Tab already exists, just activate it
        updateParentState(self, {
          activeFilePath: promptPath
        })
      } else {
        // Create new prompt tab
        const promptTab: PromptTab = {
          path: promptPath,
          content: ev.data.templateFnContent || ev.data.templateFn || '',
          modified: false,
          isPrompt: true,
          promptEntity: ev.data
        }
        
        // Add to open files
        const { openFiles: updatedFiles, activeFilePath } = mergeTabs(openFiles, [promptTab], promptTab.path)
        
        updateParentState(self, {
          openFiles: updatedFiles,
          activeFilePath: activeFilePath
        })
      }
    },
    
    handlePromptUpdated: assign({
      prompts: ({ context, event }) => {
        const ev = event as { type: 'codePrompts.PROMPT_UPDATED'; prompt: PromptEntity; promptId: string }
        return context.prompts.map(prompt => 
          prompt.id === ev.promptId ? ev.prompt : prompt
        )
      }
    }),
    
    updatePromptInOpenFiles: ({ event, self }) => {
      const ev = event as { type: 'codePrompts.PROMPT_UPDATED'; prompt: PromptEntity; promptId: string }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      
      // Update the prompt entity in the open tab
      const updatedFiles = openFiles.map((file: any) => {
        if (file.isPrompt && file.promptEntity.id === ev.promptId) {
          return {
            ...file,
            promptEntity: ev.prompt,
            modified: false
          }
        }
        return file
      })
      
      updateParentState(self, { openFiles: updatedFiles })
    },
    
    // Handle tab restoration
    openPromptTabs: ({ event }) => {
      const ev = event as { type: 'codePrompts.OPEN_TABS'; promptIds: string[] }
      // Open each prompt
      ev.promptIds.forEach(promptId => {
        sendToBackend('codePrompts.OPEN_PROMPT', { promptId })
      })
    }
  }
}).createMachine({
  id: 'prompts',
  initial: 'idle',
  context: {
    prompts: [],
    page: 1,
    totalPages: 1,
    totalCount: 0,
    isLoading: false,
    error: null
  },
  on: {
    'codePrompts.LIST': {
      target: '.loading',
      actions: ['setLoading', 'listPrompts']
    },
    'codePrompts.OPEN_PROMPT': {
      actions: 'openPrompt'
    },
    'codePrompts.SAVE_PROMPT': {
      actions: 'savePrompt'
    },
    'codePrompts.REFRESH_LIST': {
      target: '.loading',
      actions: ['setLoading', 'refreshList']
    },
    'codePrompts.OPEN_TABS': {
      actions: 'openPromptTabs'
    },
    // Backend events
    'codePrompts.PROMPTS_LISTED': {
      actions: 'handlePromptsListed'
    },
    'codePrompts.PROMPT_SELECTED': {
      actions: 'handlePromptSelected'
    },
    'codePrompts.PROMPT_UPDATED': {
      actions: ['handlePromptUpdated', 'updatePromptInOpenFiles']
    },
    'codePrompts.CODE_ERROR': {
      actions: 'setError'
    }
  },
  states: {
    idle: {
    },
    loading: {
      on: {
        'codePrompts.PROMPTS_LISTED': {
          target: 'idle',
          actions: 'handlePromptsListed'
        },
        'codePrompts.CODE_ERROR': {
          target: 'idle',
          actions: 'setError'
        }
      }
    }
  }
})