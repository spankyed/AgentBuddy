<template>
  <BaseNode
    v-bind="props"
    :source-handles="branchHandles"
    :show-source-handle="false"
    @create-connected="(nodeType, sourceHandle) => $emit('create-connected', nodeType, sourceHandle)"
    @handle-select="(nodeId, handleId) => $emit('handle-select', nodeId, handleId)"
    v-slot="{ dividerClass }"
  >
    <!-- Branch conditions list -->
    <div :class="['switch-branches mt-2 pt-2 border-t', dividerClass]">
      <!-- Branch rows with aligned handles -->
      <div
        v-for="(branch, i) in branches"
        :key="branch.id"
        class="branch-row flex items-center gap-2.5 pr-1"
      >
        <span
          v-if="branch.isElse"
          class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-semibold rounded bg-orange-500/20 text-orange-300"
          title="Else / Default"
        >
          E
        </span>
        <span
          v-else
          class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-semibold rounded bg-neutral-600/60 text-neutral-300"
        >
          {{ i + 1 }}
        </span>
        <span
          class="text-[11px] truncate flex-1"
          :class="branch.isElse ? 'text-orange-200/80 italic' : 'text-neutral-200'"
          :title="branchDisplayText(branch, i)"
        >
          {{ branchDisplayText(branch, i) }}
        </span>
      </div>
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { SwitchNode, Condition } from '@app/api'
import BaseNode, { type HandleConfig } from './BaseNode.vue'
import { NODE_DIMENSIONS } from './node-dimensions'

interface Branch {
  id: string
  label?: string
  expression?: string
  isElse?: boolean
}

interface NodeData extends Partial<SwitchNode> {
  label: string
  branches?: Branch[]
  conditions?: Condition[]
}

const props = defineProps<NodeProps<NodeData>>()

defineEmits<{
  'create-connected': [nodeType: string, sourceHandle?: string]
  'handle-select': [nodeId: string, handleId?: string]
}>()

// Format operator for display
function formatOperator(op: string): string {
  const operatorMap: Record<string, string> = {
    equals: '==',
    not_equals: '!=',
    greater_than: '>',
    less_than: '<',
    greater_than_or_equals: '>=',
    less_than_or_equals: '<=',
    contains: 'contains',
    starts_with: 'starts with',
    ends_with: 'ends with',
    matches: 'matches',
    is_empty: 'is empty',
    is_null: 'is null',
  }
  return operatorMap[op] || op
}

// Format predicate as readable expression
function formatPredicate(condition: Condition): string | undefined {
  if (condition.mode === 'code') return 'code'

  const { predicate } = condition
  if (!predicate || typeof predicate === 'function') return undefined

  const { key, operator, value } = predicate
  const opStr = formatOperator(operator)

  // Unary operators don't need value
  if (operator === 'is_empty' || operator === 'is_null') {
    return `${key} ${opStr}`
  }

  return `${key} ${opStr} ${value ?? ''}`
}

// Normalize branches from either new format or conditions
const branches = computed<Branch[]>(() => {
  if (props.data.branches) {
    return props.data.branches
  }
  if (props.data.conditions) {
    return props.data.conditions.map((c, i) => ({
      id: `branch-${i}`,
      label: c.label,
      expression: formatPredicate(c),
      isElse: c.predicate === undefined,
    }))
  }
  return []
})

const { rowHeight: ROW_HEIGHT, headerOffset: HEADER_OFFSET } = NODE_DIMENSIONS.switch

// Compute source handles for each branch
const branchHandles = computed<HandleConfig[]>(() => {
  return branches.value.map((branch, i) => ({
    id: `branch-${i}`,
    label: branch.label || `Branch ${i + 1}`,
    offsetY: HEADER_OFFSET + (i * ROW_HEIGHT) + (ROW_HEIGHT / 2)
  }))
})

function branchDisplayText(branch: Branch, index: number): string {
  return branch.label || (branch.isElse ? 'Else' : branch.expression || `Branch ${index + 1}`)
}

</script>

<style scoped>
.branch-row {
  height: 26px;
  min-height: 26px;
}
</style>
