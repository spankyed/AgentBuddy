// What the actions plugin offers other features: its list of actions as it pages them, and the edits it takes.
// Other features import this module, never the plugin's machine.
import type { SnapshotFrom } from 'xstate'
import { usePluginState } from '@abuddy/sdk/fe'
import { pluginHandle } from '@/features/plugin-handle'
import { ref as featureRef } from '@/__generated__/ref'
import type { ActionsEvents, ActionsState } from './state'

/** The ref the actions plugin runs at */
export const ACTIONS = featureRef('actions')

/** The actions plugin's actor, which its machine binds as it starts. Only the send below still needs it. */
export const actionsPlugin = pluginHandle<ActionsState>('actions')

/** The actions as the actions plugin has loaded them, and its paging */
export function useActionsList() {
  return {
    actions: usePluginState(ACTIONS, (s: SnapshotFrom<ActionsState>) => s.context.actions),
    page: usePluginState(ACTIONS, (s: SnapshotFrom<ActionsState>) => s.context.page),
    totalPages: usePluginState(ACTIONS, (s: SnapshotFrom<ActionsState>) => s.context.totalPages),
    loadingMore: usePluginState(ACTIONS, (s: SnapshotFrom<ActionsState>) => s.context.loadingMore),
  }
}

/** The events another feature may send the actions plugin: paging, and editing an action */
export type ActionsListEvent = Extract<ActionsEvents, {
  type: 'ACTIONS.LOAD_ALL' | 'ACTIONS.LOAD_MORE' | 'ACTION.UPDATE_INPUT' | 'ACTION.UPDATE_LABEL' | 'ACTION.DELETE' | 'ACTION.CREATE_INLINE'
}>

export function sendToActionsPlugin(event: ActionsListEvent): void {
  actionsPlugin.get().send(event)
}
