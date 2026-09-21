// What the actions plugin offers other features: its list of actions as it pages them, and the edits it takes.
// Other features import this module, never the plugin's machine.
import { useSelector } from '@xstate/vue'
import { pluginHandle } from '@/features/plugin-handle'
import type { ActionsEvents, ActionsState } from './state'

/** The actions plugin's actor, which its machine binds as it starts */
export const actionsPlugin = pluginHandle<ActionsState>('actions')

/** The actions as the actions plugin has loaded them, and its paging */
export function useActionsList() {
  const actor = actionsPlugin.get()
  return {
    actions: useSelector(actor, (state) => state.context.actions),
    page: useSelector(actor, (state) => state.context.page),
    totalPages: useSelector(actor, (state) => state.context.totalPages),
    loadingMore: useSelector(actor, (state) => state.context.loadingMore),
  }
}

/** The events another feature may send the actions plugin: paging, and editing an action */
export type ActionsListEvent = Extract<ActionsEvents, {
  type: 'ACTIONS.LOAD_ALL' | 'ACTIONS.LOAD_MORE' | 'ACTION.UPDATE_INPUT' | 'ACTION.UPDATE_LABEL' | 'ACTION.DELETE' | 'ACTION.CREATE_INLINE'
}>

export function sendToActionsPlugin(event: ActionsListEvent): void {
  actionsPlugin.get().send(event)
}
