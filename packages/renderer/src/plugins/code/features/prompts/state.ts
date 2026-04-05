import { setup } from 'xstate';
import { trpc } from '@/core/trpc';
import { updateParentState, getParentContext } from '../../utils/parent-communication';
import { mergeTabs, pushTabViewHistory } from '../../utils/tab-management';
import type { PromptEntity } from '@app/api';

const sendToBackend = (type: string, data: any) => {
  trpc.bus.send.mutate({
    systemId: 'code' as any,
    type: type as any,
    ...data
  } as any)
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
  isPinned?: boolean
  groupId?: string
}

export type Event =
  | { type: 'codePrompts.OPEN_PROMPT'; promptId: string }
  | { type: 'codePrompts.SAVE_PROMPT'; promptId: string; content: string }
  // Backend events
  | { type: 'codePrompts.PROMPT_SELECTED'; promptId: string; data: PromptEntity & { templateFnContent?: string } }
  | { type: 'codePrompts.PROMPT_UPDATED'; prompt: PromptEntity; promptId: string }
  // Tab restoration
  | { type: 'codePrompts.OPEN_TABS'; promptIds: string[] };

export const promptsState = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as Event
  },
  actions: {
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

    handlePromptSelected: ({ event, self }) => {
      const ev = event as { type: 'codePrompts.PROMPT_SELECTED'; promptId: string; data: PromptEntity & { templateFnContent?: string } }
      const parentContext = getParentContext(self)
      const openFiles = parentContext?.openFiles || []
      const promptPath = `prompt:${ev.promptId}`

      // Check if prompt tab already exists
      const existingTab = openFiles.find((f: any) => f.path === promptPath)

      const history = pushTabViewHistory(parentContext?.tabViewHistory || [], promptPath)

      if (existingTab) {
        // Tab already exists, just activate it
        updateParentState(self, {
          activeFilePath: promptPath,
          tabViewHistory: history
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
          activeFilePath: activeFilePath,
          tabViewHistory: history
        })
      }
    },

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
  id: 'codePrompts',
  initial: 'idle',
  context: {},
  on: {
    'codePrompts.OPEN_PROMPT': {
      actions: 'openPrompt'
    },
    'codePrompts.SAVE_PROMPT': {
      actions: 'savePrompt'
    },
    'codePrompts.OPEN_TABS': {
      actions: 'openPromptTabs'
    },
    // Backend events
    'codePrompts.PROMPT_SELECTED': {
      actions: 'handlePromptSelected'
    },
    'codePrompts.PROMPT_UPDATED': {
      actions: 'updatePromptInOpenFiles'
    }
  },
  states: {
    idle: {}
  }
})
