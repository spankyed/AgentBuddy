// What the prompts plugin offers other features: its list of prompts as it pages them, and the edits it takes.
// Other features import this module, never the plugin's machine.
import { useSelector } from '@xstate/vue'
import { pluginHandle } from '@/features/plugin-handle'
import type { PromptsEvents, PromptsState } from './state'

/** The prompts plugin's actor, which its machine binds as it starts */
export const promptsPlugin = pluginHandle<PromptsState>('prompts')

/** The prompts as the prompts plugin has loaded them, and its paging */
export function usePromptsList() {
  const actor = promptsPlugin.get()
  return {
    prompts: useSelector(actor, (state) => state.context.prompts),
    page: useSelector(actor, (state) => state.context.page),
    totalPages: useSelector(actor, (state) => state.context.totalPages),
    loadingMore: useSelector(actor, (state) => state.context.loadingMore),
  }
}

/** The events another feature may send the prompts plugin: paging, and editing a prompt */
export type PromptsListEvent = Extract<PromptsEvents, {
  type: 'PROMPTS.LOAD_ALL' | 'PROMPTS.LOAD_MORE' | 'PROMPT.UPDATE_INPUTS' | 'PROMPT.UPDATE_LABEL' | 'PROMPT.DELETE' | 'PROMPT.CREATE_INLINE'
}>

export function sendToPromptsPlugin(event: PromptsListEvent): void {
  promptsPlugin.get().send(event)
}
