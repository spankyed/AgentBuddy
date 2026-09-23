// What the flows plugin offers other features: which flow is the root flow, opening a flow, and the resources a step
// form is given. Other features import this module, never the plugin's machine.
import type { SnapshotFrom } from 'xstate'
import { usePluginState } from '@abuddy/sdk/fe'
import type { EARS } from '@/__generated__/ears'
import { pluginHandle } from '@/features/plugin-handle'
import { ref as featureRef } from '@/__generated__/ref'
import type { FlowsState } from './state'

export type { FormResources } from './types/form-props'

/** The ref the flows plugin runs at */
export const FLOWS = featureRef('flows')

/** The flows plugin's actor, which its machine binds as it starts. Only `selectFlow` still needs it. */
export const flowsPlugin = pluginHandle<FlowsState>('flows')

/** The flow with the root role, as the flows plugin last heard */
export function useRootFlowId() {
  return usePluginState(FLOWS, (s: SnapshotFrom<FlowsState>) => s.context.rootFlowId)
}

/** Opens a flow in the flows plugin's editor */
export function selectFlow(flowId: EARS.EntityId): void {
  flowsPlugin.get().send({ type: 'FLOW.SELECT', flowId })
}
