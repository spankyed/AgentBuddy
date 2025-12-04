<template>
  <BaseNode
    v-bind="props"
    :source-handles="branchHandles"
    :show-source-handle="false"
    @create-connected="(nodeType, sourceHandle) => $emit('create-connected', nodeType, sourceHandle)"
    @handle-select="(nodeId, handleId) => $emit('handle-select', nodeId, handleId)"
  >
    <!-- Branch conditions list -->
    <div class="switch-branches mt-2 pt-2 border-t border-neutral-700/50">
      <!-- Branch rows with aligned handles -->
      <div
        v-for="(branch, i) in branches"
        :key="branch.id"
        class="branch-row flex items-center gap-2 pr-1"
      >
        <span class="flex-shrink-0 w-4 h-4 flex items-center justify-center text-[9px] font-medium rounded bg-neutral-700/50 text-neutral-400">
          {{ i + 1 }}
        </span>
        <span class="text-[11px] text-neutral-300 truncate flex-1">
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
const ROW_HEIGHT = 22
// Header offset: node padding (8px) + header height (~24px) + border-t margin (8px)
const HEADER_OFFSET = 48

// Compute source handles for each branch
const branchHandles = computed<HandleConfig[]>(() => {
  return branches.value.map((branch, i) => ({
    id: `branch-${i}`,
    label: branch.label || `Branch ${i + 1}`,
    offsetY: HEADER_OFFSET + (i * ROW_HEIGHT) + (ROW_HEIGHT / 2)
  }))
})
</script>

<style scoped>
.branch-row {
  height: 22px;
  min-height: 22px;
}
</style>
