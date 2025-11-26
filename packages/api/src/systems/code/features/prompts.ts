import { setup } from 'xstate'
import { emit } from '@/core/utils/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import { systemBus } from '@/core/utils/event-helpers'
import { z } from 'zod'
import { repository } from '@/repository'
import { EARS } from '@/core/types'
import type { PromptEntity } from '@/systems/prompts/types'

const pluginId = 'code' as const
const busEvent = systemBus(pluginId)

// Incoming events from frontend
export const IncomingPromptsEvents = [
  busEvent('codePrompts.OPEN_PROMPT', { promptId: z.string() }),
  busEvent('codePrompts.SAVE_PROMPT', {
    promptId: z.string(),
    templateFn: z.string()
  }),
  busEvent('codePrompts.UPDATE_PROMPT_INPUTS', {
    promptId: z.string(),
    inputs: z.record(z.any())
  }),
] as const

// Outgoing events to frontend
export type OutgoingPromptsEvents =
  | { type: 'codePrompts.PROMPT_SELECTED'; promptId: string; data: PromptEntity & { templateFnContent?: string } }
  | { type: 'codePrompts.PROMPT_UPDATED'; prompt: PromptEntity; promptId: string }
  | { type: 'codePrompts.CODE_ERROR'; data: { message: string } }

export interface Context {
  // No local state needed for prompts feature
}

export type Event =
  | { type: 'codePrompts.OPEN_PROMPT'; promptId: string }
  | { type: 'codePrompts.SAVE_PROMPT'; promptId: string; templateFn: string }
  | { type: 'codePrompts.UPDATE_PROMPT_INPUTS'; promptId: string; inputs: Record<string, any> };


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

        const wrapped = emit(pluginId, {
          type: 'codePrompts.PROMPT_SELECTED',
          promptId: ev.promptId as EARS.EntityId,
          data: promptWithContent
        } as any)
        rootEvents.emitOutgoing(wrapped.event as any)
      } else {
        const wrapped = emit(pluginId, {
          type: 'codePrompts.CODE_ERROR',
          data: {
            message: `Prompt ${ev.promptId} not found`
          }
        } as any)
        rootEvents.emitOutgoing(wrapped.event as any)
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
        const wrapped = emit(pluginId, {
          type: 'codePrompts.PROMPT_UPDATED',
          prompt: updatedPrompt,
          promptId: updatedPrompt.id
        } as any)
        rootEvents.emitOutgoing(wrapped.event as any)
      }
    },

    updatePromptInputs: ({ event }) => {
      const ev = event as { type: 'codePrompts.UPDATE_PROMPT_INPUTS'; promptId: string; inputs: Record<string, any> }

      // Update the prompt with new inputs
      repository.promptCommands.update(ev.promptId as EARS.EntityId, {
        inputs: ev.inputs
      })

      const updatedPrompt = repository.promptQueries.byId(ev.promptId as EARS.EntityId)
      if (updatedPrompt) {
        const wrapped = emit(pluginId, {
          type: 'codePrompts.PROMPT_UPDATED',
          prompt: updatedPrompt,
          promptId: updatedPrompt.id
        } as any)
        rootEvents.emitOutgoing(wrapped.event as any)
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
        },
        'codePrompts.UPDATE_PROMPT_INPUTS': {
          actions: 'updatePromptInputs'
        }
      }
    }
  }
})
