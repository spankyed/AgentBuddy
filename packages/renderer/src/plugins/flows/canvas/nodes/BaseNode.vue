<template>
  <div
    class="flow-node group"
    :class="[
      nodeClasses,
      {
        'ring-1 ring-white/30': isActive || selected,
        'cursor-pointer': selectable,
      }
    ]"
  >
    <!-- Remove glow effect for cleaner look -->

    <!-- Main content -->
    <div class="relative z-10">
      <!-- Header -->
      <div class="flex items-center gap-2">
        <component
          :is="nodeIcon"
          class="w-3.5 h-3.5 flex-shrink-0 opacity-80"
          :class="iconTextColor"
        />
        <div class="flex-1 flex justify-center pr-3.5">
          <span class="text-[13px] font-medium text-neutral-200">{{ data.label }}</span>
        </div>
      </div>

      <!-- Custom content slot -->
      <slot />

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

    <!-- Connection handles -->
    <Handle
      v-if="showTargetHandle"
      type="target"
      :position="Position.Left"
      class="!w-2 !h-2 !bg-neutral-600 !border !border-neutral-500 hover:!bg-neutral-400 transition-all !-left-1"
    />
    <Handle
      v-if="showSourceHandle"
      type="source"
      :position="Position.Right"
      class="!w-2 !h-2 !bg-neutral-600 !border !border-neutral-500 hover:!bg-neutral-400 transition-all !-right-1"
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
import { getNodeClasses, getNodeGlowClasses, getNodeStatusClasses, getNodeAccentBarClasses, getNodeIconTextColor, getNodeConfig } from '../../config/node-config'
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

const nodeIcon = computed(() => {
  const type = props.data.nodeType || 'action'
  const config = getNodeConfig(type)
  return config?.icon
})

const iconTextColor = computed(() => {
  const type = props.data.nodeType || 'action'
  return getNodeIconTextColor(type)
})

const glowClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  return getNodeGlowClasses(type)
})

const statusClasses = computed(() => {
  if (!props.data.status) return ''
  return getNodeStatusClasses(props.data.status, 'simple') as string
})

const accentBarClasses = computed(() => {
  const type = props.data.nodeType || 'action'
  return getNodeAccentBarClasses(type)
})
</script>

<style scoped>
.flow-node {
  min-width: 120px;
  max-width: 200px;
  transition: all 0.15s ease;
}

.flow-node:hover {
  filter: brightness(1.05);
}

:deep(.vue-flow__handle) {
  transition: all 0.15s ease;
}
</style>
