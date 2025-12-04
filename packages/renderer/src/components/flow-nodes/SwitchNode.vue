<template>
  <BaseNode
    v-bind="props"
    :source-handles="branchHandles"
    :show-source-handle="false"
    @create-connected="(nodeType, sourceHandle) => $emit('create-connected', nodeType, sourceHandle)"
    @handle-select="(nodeId, handleId) => $emit('handle-select', nodeId, handleId)"
  >
    <!-- Branch conditions list -->
    <div :class="['switch-branches mt-2 pt-2 border-t', dividerClass]">
      <!-- Branch rows with aligned handles -->
      <div
        v-for="(branch, i) in branches"
        :key="branch.id"
        class="branch-row flex items-center gap-2.5 pr-1"
      >
        <span class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-semibold rounded bg-neutral-600/60 text-neutral-300">
          {{ i + 1 }}
        </span>
        <span class="text-[11px] text-neutral-200 truncate flex-1">
          {{ branch.label || branch.expression || `Branch ${i + 1}` }}
        </span>
      </div>
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { SwitchNode } from '@app/api'
import BaseNode, { type HandleConfig } from './BaseNode.vue'
import { getNodeDividerClass } from './node-config'

interface Branch {
  id: string
  label?: string
  expression?: string
}

interface NodeData extends Partial<SwitchNode> {
  label: string
  branches?: Branch[]
  // Legacy support for conditions
  conditions?: Array<{ expr: string; label?: string }>
}

const props = defineProps<NodeProps<NodeData>>()

defineEmits<{
  'create-connected': [nodeType: string, sourceHandle?: string]
  'handle-select': [nodeId: string, handleId?: string]
}>()

// Normalize branches from either new format or legacy conditions
const branches = computed<Branch[]>(() => {
  if (props.data.branches) {
    return props.data.branches
  }
  // Legacy: convert conditions to branches
  if (props.data.conditions) {
    return props.data.conditions.map((c, i) => ({
      id: `branch-${i}`,
      label: c.label,
      expression: c.expr
    }))
  }
  return []
})

// Row height for handle positioning (matches .branch-row height)
const ROW_HEIGHT = 26
// Header offset: node padding (8px) + header height (~24px) + divider margin (8px)
const HEADER_OFFSET = 43

// Compute source handles for each branch
const branchHandles = computed<HandleConfig[]>(() => {
  return branches.value.map((branch, i) => ({
    id: `branch-${i}`,
    label: branch.label || `Branch ${i + 1}`,
    offsetY: HEADER_OFFSET + (i * ROW_HEIGHT) + (ROW_HEIGHT / 2)
  }))
})

const dividerClass = computed(() => getNodeDividerClass('switch'))
</script>

<style scoped>
.branch-row {
  height: 26px;
  min-height: 26px;
}
</style>
