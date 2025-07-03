<template>
  <div 
    class="flow-node"
    :class="[
      nodeClasses,
      {
        'ring-2 ring-blue-500': isActive,
        'cursor-pointer hover:ring-2 hover:ring-purple-500': selectable,
      }
    ]"
  >
    <div class="flex items-center gap-2">
      <div 
        class="w-3 h-3 rounded-full"
        :class="iconClasses"
      />
      <span class="text-xs font-medium">{{ data.label }}</span>
    </div>
    
    <!-- Show node type badge -->
    <div class="mt-1" v-if="data.nodeType">
      <span class="text-[10px] text-neutral-400 capitalize">
        {{ data.nodeType }}
      </span>
    </div>
    
    <!-- Custom content slot -->
    <div v-if="$slots.default" class="mt-2">
      <slot />
    </div>
    
    <!-- Status indicator (if provided) -->
    <div v-if="showStatusIndicator && data.status" class="absolute -top-2 -left-2">
      <div 
        class="w-3 h-3 rounded-full border-2 border-neutral-900"
        :class="statusClasses"
      />
    </div>
    
    <Handle
      v-if="showTargetHandle"
      type="target"
      :position="Position.Left"
      :style="{ background: '#555' }"
    />
    <Handle
      v-if="showSourceHandle"
      type="source"
      :position="Position.Right"
      :style="{ background: '#555' }"
    />
  </div>
</template>

<script lang="ts">
export default {
  name: 'BaseNode'
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { getNodeCanvasClasses, getNodeIconDotClasses } from '../../config/node-config'
import type { NodeKind } from '@abuddy/api'

interface BaseNodeData {
  label: string
  nodeType?: NodeKind
  status?: 'active' | 'paused' | 'completed' | 'failed'
  [key: string]: any
}

interface Props extends NodeProps<BaseNodeData> {
  isActive?: boolean
  selectable?: boolean
  showTargetHandle?: boolean
  showSourceHandle?: boolean
  showStatusIndicator?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  selectable: true,
  showTargetHandle: true,
  showSourceHandle: true,
  showStatusIndicator: false
})

const nodeClasses = computed(() => {
  return getNodeCanvasClasses(props.data.nodeType || 'action')
})

const iconClasses = computed(() => {
  return getNodeIconDotClasses(props.data.nodeType || 'action')
})

const statusClasses = computed(() => {
  if (!props.data.status) return ''
  
  switch (props.data.status) {
    case 'active':
      return 'bg-green-500'
    case 'paused':
      return 'bg-yellow-500'
    case 'completed':
      return 'bg-blue-500'
    case 'failed':
      return 'bg-red-500'
    default:
      return 'bg-neutral-500'
  }
})
</script>

<style scoped>
.flow-node {
  min-width: 150px;
  transition: all 0.2s ease;
}
</style>