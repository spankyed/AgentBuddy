import type { NodeKind } from '@/__generated__/types'
import { default as TriggerNode } from './TriggerNode.vue'
import { default as BaseNode } from '@abuddy/sdk/fe/components/BaseNode.vue'
import { nodeConfigs } from '@abuddy/sdk/fe/components/node-styles'
import { stepRegistry } from '@abuddy/sdk/steps'

export { BaseNode }
export type { HandleConfig } from '@abuddy/sdk/fe/components/BaseNode.vue'

export const nodeTypes: Record<NodeKind, any> = new Proxy({} as any, {
  get(_target, type: string | symbol) {
    if (typeof type !== 'string') return undefined;
    if (stepRegistry.isTrigger(type)) return TriggerNode;
    return stepRegistry.getComponent(type) || BaseNode;
  },
  ownKeys() {
    return Object.keys(nodeConfigs);
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (prop in nodeConfigs) {
      return { configurable: true, enumerable: true, value: undefined };
    }
    return undefined;
  },
  has(_target, prop: string) {
    return prop in nodeConfigs;
  },
})
