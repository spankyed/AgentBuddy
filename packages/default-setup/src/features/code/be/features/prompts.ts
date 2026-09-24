import type { IncomingPromptsEvents, OutgoingPromptsEvents } from '../contract'
import { broadcastToPlugin } from '@/__generated__/events';
import { setup } from 'xstate'

import { repository } from '@/__generated__/repository';
import { EARS } from '@/__generated__/ears'
import type { PromptEntity } from '@abuddy/sdk'

const pluginId = 'code' as const

// Incoming events from frontend

// Outgoing events to frontend

export interface Context {
  // No local state needed for prompts feature
}

export type Event =
  | { type: 'codePrompts.OPEN_PROMPT'; promptId: string }
  | { type: 'codePrompts.SAVE_PROMPT'; promptId: string; templateFn: string };

export const promptsSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  actions: {
    openPrompt: ({ event }) => {
      const ev = event as { type: 'codePrompts.OPEN_PROMPT'; promptId: string }
      const prompt = repository.promptQueries.byId(ev.promptId as EARS.EntityId)

      if (prompt) {
        // Include the templateFn content directly
        const promptWithContent: PromptEntity & { templateFnContent?: string } = {
          ...prompt,
          templateFnContent: prompt.templateFn
        }

        broadcastToPlugin(pluginId, {
          type: 'codePrompts.PROMPT_SELECTED',
          promptId: ev.promptId as EARS.EntityId,
          data: promptWithContent
        })
      } else {
        broadcastToPlugin(pluginId, {
          type: 'codePrompts.CODE_ERROR',
          data: {
            message: `Prompt ${ev.promptId} not found`
          }
        })
      }
    },

    savePrompt: ({ event }) => {
      const ev = event as { type: 'codePrompts.SAVE_PROMPT'; promptId: string; templateFn: string }

      // Update the prompt with new templateFn
      repository.promptCommands.update(ev.promptId as EARS.EntityId, {
        templateFn: ev.templateFn
      })

      const updatedPrompt = repository.promptQueries.byId(ev.promptId as EARS.EntityId)
      if (updatedPrompt) {
        broadcastToPlugin(pluginId, {
          type: 'codePrompts.PROMPT_UPDATED',
          prompt: updatedPrompt,
          promptId: updatedPrompt.id
        })
      }
    }
  }
}).createMachine({
  id: 'codePrompts',
  initial: 'idle',
  context: {},
  states: {
    idle: {
      on: {
        'codePrompts.OPEN_PROMPT': {
          actions: 'openPrompt'
        },
        'codePrompts.SAVE_PROMPT': {
          actions: 'savePrompt'
        }
      }
    }
  }
})
