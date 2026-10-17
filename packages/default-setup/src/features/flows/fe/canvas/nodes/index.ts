import { computed, type Component } from 'vue'
import { getStepBinding, getStepDeclaration } from '@apackdev/sdk/fe'
import TriggerNode from './TriggerNode.vue'
import BaseNode from '@apackdev/ui/components/BaseNode'
import { useNodeStyles } from '@apackdev/ui/components/node-styles'

export { BaseNode }
export type { HandleConfig } from '@apackdev/ui/components/node-handles'

/** The open canvas follows declarations and current eligible component bindings. */
export function useNodeTypes() {
  const { getNodeConfigs } = useNodeStyles()
  return computed(() => Object.fromEntries(Object.keys(getNodeConfigs()).map(type => [type,
    getStepDeclaration(type)?.declaration.kind === 'trigger' ? TriggerNode
      : (getStepBinding(type)?.binding.fe?.components?.node as Component | undefined) ?? BaseNode,
  ])))
}
