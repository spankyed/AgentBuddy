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
  busEvent('codePrompts.LIST', { page: z.number().optional() }),
  busEvent('codePrompts.OPEN_PROMPT', { promptId: z.string() }),
  busEvent('codePrompts.SAVE_PROMPT', { 
    promptId: z.string(),
    templateFn: z.string()
  }),
] as const

// Outgoing events to frontend
export type OutgoingPromptsEvents = 
  | { type: 'codePrompts.PROMPTS_LISTED'; data: { prompts: PromptEntity[]; page: number; totalPages: number; totalCount: number } }
  | { type: 'codePrompts.PROMPT_SELECTED'; promptId: string; data: PromptEntity & { templateFnContent?: string } }
  | { type: 'codePrompts.PROMPT_UPDATED'; prompt: PromptEntity; promptId: string }
  | { type: 'codePrompts.CODE_ERROR'; data: { message: string } }

export interface Context {
  // No local state needed for prompts feature
}

export type Event = 
  | { type: 'codePrompts.LIST'; page?: number }
  | { type: 'codePrompts.OPEN_PROMPT'; promptId: string }
  | { type: 'codePrompts.SAVE_PROMPT'; promptId: string; templateFn: string }
  | { type: 'CODE_STARTUP' };


export const promptsSystem = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  actions: {
    listPrompts: ({ event }) => {
      const ev = event as { type: 'codePrompts.LIST'; page?: number }
      const data = repository.promptQueries.startupData(ev.page || 1)
      
      const wrapped = emit(pluginId, {
        type: 'codePrompts.PROMPTS_LISTED',
        data
      } as any)
      rootEvents.emitOutgoing(wrapped.event as any)
    },

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
      const result = repository.promptCommands.update(ev.promptId as EARS.EntityId, {
        templateFn: ev.templateFn
      })
      
      if (result.success) {
        const updatedPrompt = repository.promptQueries.byId(ev.promptId as EARS.EntityId)
        if (updatedPrompt) {
          const wrapped = emit(pluginId, {
            type: 'codePrompts.PROMPT_UPDATED',
            prompt: updatedPrompt,
            promptId: updatedPrompt.id
          } as any)
          rootEvents.emitOutgoing(wrapped.event as any)
        }
      } else {
        const wrapped = emit(pluginId, {
          type: 'codePrompts.CODE_ERROR',
          data: {
            message: `Failed to update prompt: ${result.error || 'Unknown error'}`
          }
        } as any)
        rootEvents.emitOutgoing(wrapped.event as any)
      }
    },

    sendStartupData: () => {
      // Send initial prompts list on startup
      const data = repository.promptQueries.startupData(1)
      
      const wrapped = emit(pluginId, {
        type: 'codePrompts.PROMPTS_LISTED',
        data
      } as any)
      rootEvents.emitOutgoing(wrapped.event as any)
    }
  }
}).createMachine({
  id: 'codePrompts',
  initial: 'idle',
  context: {},
  states: {
    idle: {
      on: {
        'codePrompts.LIST': {
          actions: 'listPrompts'
        },
        'codePrompts.OPEN_PROMPT': {
          actions: 'openPrompt'
        },
        'codePrompts.SAVE_PROMPT': {
          actions: 'savePrompt'
        },
        'CODE_STARTUP': {
          actions: 'sendStartupData'
        }
      }
    }
  }
})