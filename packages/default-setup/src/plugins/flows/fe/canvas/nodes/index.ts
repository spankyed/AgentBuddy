import type { NodeKind } from '@app/api'
import { default as TriggerNode } from './TriggerNode.vue'
import { default as BaseNode } from './BaseNode.vue'
import { nodeConfigs } from './node-config'
import { stepRegistry } from '@abuddy/sdk/steps'

export { BaseNode }
export type { HandleConfig } from './BaseNode.vue'
export * from './node-config'

export const nodeTypes: Record<NodeKind, any> = new Proxy({} as any, {
  get(_target, type: string) {
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

export const nodeConnectionRules = Object.entries(nodeConfigs).reduce((acc, [nodeType, config]) => {
  if (config) {
    acc[nodeType as NodeKind] = config.connectionRules
  }
  return acc
}, {} as Record<NodeKind, { inputs: number; outputs: number }>)
