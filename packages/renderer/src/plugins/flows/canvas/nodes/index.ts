import type { NodeProps } from '@vue-flow/core'
import ListenNode from './ListenNode.vue'
import FireNode from './FireNode.vue'
import VariableNode from './VariableNode.vue'
import ActionNode from './ActionNode.vue'
import type { NodeKind } from '@app/api'
import { default as BaseNode } from './BaseNode.vue'
import { default as SwitchNode } from './SwitchNode.vue'
import { nodeConfigs } from './node-config'

export { BaseNode }
export { SwitchNode }
export type { HandleConfig } from './BaseNode.vue'
export * from './node-config'

// Map node types to their components
const componentMap = {
  ListenNode,
  FireNode,
  SwitchNode,
  VariableNode,
  ActionNode,
}

export const nodeTypes = Object.entries(nodeConfigs).reduce((acc, [nodeType, config]) => {
  if (config) {
    const componentName = config.component
    if (componentName && componentMap[componentName as keyof typeof componentMap]) {
      acc[nodeType as NodeKind] = componentMap[componentName as keyof typeof componentMap]
    }
  }
  return acc
}, {} as Record<NodeKind, any>)

// Define connection rules for each node type - now pulled from config
export const nodeConnectionRules = Object.entries(nodeConfigs).reduce((acc, [nodeType, config]) => {
  if (config) {
    acc[nodeType as NodeKind] = config.connectionRules
  }
  return acc
}, {} as Record<NodeKind, { inputs: number; outputs: number }>)
