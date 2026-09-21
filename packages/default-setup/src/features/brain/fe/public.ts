// What the brain plugin offers other features: the root flow the running brain started with.
// Other features import this module, never the plugin's machine.
import { useSelector } from '@xstate/vue'
import { pluginHandle } from '@/features/plugin-handle'
import type { BrainState } from './state'

/** The brain plugin's actor, which its machine binds as it starts */
export const brainPlugin = pluginHandle<BrainState>('brain')

/** The root flow the running brain started with; undefined while it's stopped */
export function useRunningRootFlowId() {
  return useSelector(brainPlugin.get(), (state) => state.context.runningRootFlowId)
}
