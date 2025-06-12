import type { NodeProps } from '@vue-flow/core'
import ListenNode from './ListenNode.vue'
import FireNode from './FireNode.vue'
import DecisionNode from './DecisionNode.vue'
import VariableNode from './VariableNode.vue'
import ActionNode from './ActionNode.vue'
import type { NodeKind } from '@abuddy/api'

// Map node types to their components
export const nodeTypes: Record<NodeKind, any> = {
  listen: ListenNode,
  fire: FireNode,
  decision: DecisionNode,
  create: VariableNode,
  update: VariableNode,
  query: VariableNode,
  action: ActionNode,
  transform: VariableNode,
  flow: VariableNode,
}

// Define connection rules for each node type
export const nodeConnectionRules: Record<NodeKind, { inputs: number; outputs: number }> = {
  listen: { inputs: 0, outputs: -1 }, // -1 means unlimited
  fire: { inputs: 1, outputs: 0 },
  decision: { inputs: 1, outputs: -1 },
  query: { inputs: 1, outputs: 1 },
  create: { inputs: 1, outputs: 1 },
  update: { inputs: 1, outputs: 1 },
  action: { inputs: 1, outputs: 1 },
  transform: { inputs: 1, outputs: 1 },
  flow: { inputs: 1, outputs: 1 },
}
