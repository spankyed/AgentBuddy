// What the prompts plugin offers other features: its list of prompts as it pages them, and the edits it takes.
// Other features import this module, never the plugin's machine.
import type { SnapshotFrom } from 'xstate'
import { usePluginState } from '@abuddy/sdk/fe'
import { pluginHandle } from '@/features/plugin-handle'
import { ref as featureRef } from '@/__generated__/ref'
import type { PromptsEvents, PromptsState } from './state'

/** The ref the prompts plugin runs at */
export const PROMPTS = featureRef('prompts')

/** The prompts plugin's actor, which its machine binds as it starts. Only the send below still needs it. */
export const promptsPlugin = pluginHandle<PromptsState>('prompts')

/** The prompts as the prompts plugin has loaded them, and its paging */
export function usePromptsList() {
  return {
    prompts: usePluginState(PROMPTS, (s: SnapshotFrom<PromptsState>) => s.context.prompts),
    page: usePluginState(PROMPTS, (s: SnapshotFrom<PromptsState>) => s.context.page),
    totalPages: usePluginState(PROMPTS, (s: SnapshotFrom<PromptsState>) => s.context.totalPages),
    loadingMore: usePluginState(PROMPTS, (s: SnapshotFrom<PromptsState>) => s.context.loadingMore),
  }
}

/** The events another feature may send the prompts plugin: paging, and editing a prompt */
export type PromptsListEvent = Extract<PromptsEvents, {
  type: 'PROMPTS.LOAD_ALL' | 'PROMPTS.LOAD_MORE' | 'PROMPT.UPDATE_INPUTS' | 'PROMPT.UPDATE_LABEL' | 'PROMPT.DELETE' | 'PROMPT.CREATE_INLINE'
}>

export function sendToPromptsPlugin(event: PromptsListEvent): void {
  promptsPlugin.get().send(event)
}
