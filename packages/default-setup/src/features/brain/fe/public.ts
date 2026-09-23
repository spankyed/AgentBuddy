// What the brain plugin offers other features: the root flow the running brain started with.
// Other features import this module, never the plugin's machine.
import type { SnapshotFrom } from 'xstate'
import { usePluginState } from '@abuddy/sdk/fe'
import { ref as featureRef } from '@/__generated__/ref'
import type { BrainState } from './state'

/** The ref the brain plugin runs at */
export const BRAIN = featureRef('brain')

/** The root flow the running brain started with; undefined while it's stopped */
export function useRunningRootFlowId() {
  return usePluginState(BRAIN, (s: SnapshotFrom<BrainState>) => s.context.runningRootFlowId)
}
