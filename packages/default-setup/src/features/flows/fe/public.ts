// What the flows plugin offers other features: which flow is the root flow, opening a flow, and the resources a step
// form is given. Other features import this module, never the plugin's machine.
import { useSelector } from '@xstate/vue'
import type { EARS } from '@/__generated__/ears'
import { pluginHandle } from '@/features/plugin-handle'
import type { FlowsState } from './state'

export type { FormResources } from './types/form-props'

/** The flows plugin's actor, which its machine binds as it starts */
export const flowsPlugin = pluginHandle<FlowsState>('flows')

/** The flow with the root role, as the flows plugin last heard */
export function useRootFlowId() {
  return useSelector(flowsPlugin.get(), (state) => state.context.rootFlowId)
}

/** Opens a flow in the flows plugin's editor */
export function selectFlow(flowId: EARS.EntityId): void {
  flowsPlugin.get().send({ type: 'FLOW.SELECT', flowId })
}
