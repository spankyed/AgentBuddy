// What the flows plugin offers other features: which flow is the root flow, and the resources a step form is
// given. What they may send it is its own `accepts` declaration, beside the plugin.
import type { SnapshotFrom } from 'xstate'
import { usePluginState } from '@abuddy/sdk/fe'
import { ref as featureRef } from '@/__generated__/ref'
import type { FlowsState } from './state'

export type { FormResources } from './types/form-props'

/** The ref the flows plugin runs at */
export const FLOWS = featureRef('flows')

/** The flow with the root role, as the flows plugin last heard */
export function useRootFlowId() {
  return usePluginState(FLOWS, (s: SnapshotFrom<FlowsState>) => s.context.rootFlowId)
}

