<template>
  <div
    class="flow-node group"
    :class="[
      nodeClasses,
      {
        'ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/10': isActive || selected,
        'cursor-pointer': selectable,
      }
    ]"
  >
    <!-- Remove glow effect for cleaner look -->

    <!-- Main content -->
    <div class="relative z-10">
      <!-- Header -->
      <div class="flex items-center gap-2">
        <div
          class="w-2 h-2 rounded-full flex-shrink-0"
          :class="iconClasses"
        />
        <span class="text-sm font-medium text-neutral-100">{{ data.label }}</span>
      </div>

      <!-- Custom content slot -->
      <div v-if="$slots.default" class="mt-2 space-y-1">
        <slot />
      </div>

      <!-- Node type badge at bottom -->
      <div class="mt-1.5 flex items-center gap-1.5" v-if="data.nodeType || $slots.badge">
        <span
          v-if="data.nodeType"
          class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wider uppercase"
          :class="badgeClasses"
        >
          {{ formatNodeType(data.nodeType) }}
        </span>
        <slot name="badge" />
      </div>
    </div>

    <!-- Status indicator (if provided) -->
    <div v-if="showStatusIndicator && data.status" class="absolute -top-1.5 -right-1.5">
      <div class="relative">
        <div
          class="w-2.5 h-2.5 rounded-full"
          :class="statusClasses"
        />
        <div
          v-if="data.status === 'active'"
          class="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping"
          :class="statusClasses"
        />
      </div>
    </div>

    <!-- Connection handles with better visibility -->
    <Handle
      v-if="showTargetHandle"
      type="target"
      :position="Position.Left"
      class="!w-2.5 !h-2.5 !bg-neutral-700 !border-2 !border-neutral-600 hover:!bg-blue-500 hover:!border-blue-400 transition-all"
    />
    <Handle
      v-if="showSourceHandle"
      type="source"
      :position="Position.Right"
      class="!w-2.5 !h-2.5 !bg-neutral-700 !border-2 !border-neutral-600 hover:!bg-blue-500 hover:!border-blue-400 transition-all"
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
import { getNodeClasses, getNodeGlowClasses, getNodeBadgeClasses, getNodeIconDotClasses, getNodeStatusClasses, getNodeAccentBarClasses } from '../../config/node-config'
import type { NodeKind } from '@app/api'

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
  isImplemented?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  selectable: true,
  showTargetHandle: true,
  showSourceHandle: true,
  showStatusIndicator: false
})

const nodeClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  return getNodeClasses(type)
})

const iconClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  return getNodeIconDotClasses(type, { includeRing: true })
})

const glowClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  return getNodeGlowClasses(type)
})

const badgeClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  return getNodeBadgeClasses(type)
})

const statusClasses = computed(() => {
  if (!props.data.status) return ''
  return getNodeStatusClasses(props.data.status, 'simple') as string
})

const accentBarClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  return getNodeAccentBarClasses(type)
})

const formatNodeType = (type: string) => {
  // Format node type for display
  return type.replace(/_/g, ' ')
}
</script>

<style scoped>
.flow-node {
  min-width: 150px;
  max-width: 240px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
}

.flow-node:hover {
  transform: translateY(-0.5px);
}

/* Vue Flow handle overrides for better visibility */
:deep(.vue-flow__handle) {
  transition: all 0.2s ease;
}

/* :deep(.vue-flow__handle:hover) {
  transform: scale(1.2);
} */

/* Smooth transitions for all interactive elements */
.flow-node * {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}
</style>
