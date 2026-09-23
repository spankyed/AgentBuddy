// What the prompts plugin offers other features: its list of prompts as it pages them. The edits it takes are its
// own `accepts` declaration, beside the plugin.
import type { SnapshotFrom } from 'xstate'
import { usePluginState } from '@abuddy/sdk/fe'
import { ref as featureRef } from '@/__generated__/ref'
import type { PromptsEvents, PromptsState } from './state'

/** The ref the prompts plugin runs at */
export const PROMPTS = featureRef('prompts')

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
  type: 'PROMPTS.LOAD_ALL' | 'PROMPTS.LOAD_MORE' | 'PROMPT.UPDATE_INPUTS' | 'PROMPT.UPDATE_LABEL' | 'PROMPT.DELETE' | 'PROMPT.CREATE_INLINE' | 'PROMPT.SELECT'
}>

