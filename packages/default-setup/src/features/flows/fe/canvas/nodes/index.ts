import type { NodeKind } from '#generated/types.ts'
import { default as TriggerNode } from './TriggerNode.vue'
import { default as BaseNode } from '@apack/ui/components/BaseNode'
import { nodeConfigs } from '@apack/ui/components/node-styles'
import { stepRegistry } from '@apack/sdk/steps'

export { BaseNode }
export type { HandleConfig } from '@apack/ui/components/node-handles'

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
