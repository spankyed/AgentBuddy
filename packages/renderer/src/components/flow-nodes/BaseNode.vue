<template>
  <div
    class="flow-node group"
    :class="[
      nodeClasses,
      {
        'ring-2 ring-blue-400/70 shadow-lg shadow-blue-500/20': isEditing,
        'ring-1 ring-white/30': !isEditing && (isActive || selected),
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
        <div class="flex-1 flex justify-center pr-1 hover:underline" data-action="open-form">
          <span
            class="text-[13px] font-medium text-neutral-200 cursor-pointer"

          >{{ data.label }}</span>
        </div>
      </div>

      <!-- Custom content slot or auto-rendered content -->
      <slot>
        <!-- Auto-render eventType if present -->
        <div v-if="data.eventType" class="mt-1.5 pt-1.5 border-t border-neutral-700/50 flex items-center justify-center">
          <span class="text-[10px] text-neutral-400 font-mono truncate">{{ data.eventType }}</span>
        </div>
        <!-- Auto-render params count if present -->
        <div v-else-if="data.params && Object.keys(data.params).length > 0" class="mt-1.5 pt-1.5 border-t border-neutral-700/50 flex items-center justify-center">
          <span class="text-[10px] text-neutral-400 uppercase tracking-wide">{{ Object.keys(data.params).length }} param{{ Object.keys(data.params).length !== 1 ? 's' : '' }}</span>
        </div>
      </slot>

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
    <!-- Dynamic target handles -->
    <template v-if="targetHandles && targetHandles.length > 0">
      <Handle
        v-for="handle in targetHandles"
        :key="handle.id"
        :id="handle.id"
        type="target"
        :position="Position.Left"
        :style="{ top: handle.offsetY ? `${handle.offsetY}px` : '50%' }"
        class="!w-2 !h-2 !bg-neutral-600 !border !border-neutral-500 hover:!bg-neutral-400 transition-all !-left-1"
      />
    </template>
    <!-- Default single target handle -->
    <Handle
      v-else-if="showTargetHandle"
      type="target"
      :position="Position.Left"
      class="!w-2 !h-2 !bg-neutral-600 !border !border-neutral-500 hover:!bg-neutral-400 transition-all !-left-1"
    />

    <!-- Dynamic source handles -->
    <template v-if="sourceHandles && sourceHandles.length > 0">
      <Handle
        v-for="handle in sourceHandles"
        :key="handle.id"
        :id="handle.id"
        type="source"
        :position="Position.Right"
        :style="{ top: handle.offsetY ? `${handle.offsetY}px` : '50%', transform: 'translateY(-50%)' }"
        class="!w-2 !h-2 !bg-neutral-600 !border !border-neutral-500 hover:!bg-neutral-400 transition-all !-right-1"
      />
    </template>
    <!-- Default single source handle -->
    <Handle
      v-else-if="showSourceHandle"
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
import { getNodeClasses, getNodeGlowClasses, getNodeStatusClasses, getNodeAccentBarClasses, getNodeIconTextColor, getNodeConfig } from './node-config'
import type { NodeKind } from '@app/api'

export interface HandleConfig {
  id: string
  label?: string
  offsetY?: number  // Vertical offset in pixels from top of node
}

interface BaseNodeData {
  label: string
  nodeType?: NodeKind
  status?: 'active' | 'paused' | 'completed' | 'failed'
  [key: string]: any
}

interface Props extends NodeProps<BaseNodeData> {
  isActive?: boolean
  isEditing?: boolean
  selectable?: boolean
  showTargetHandle?: boolean
  showSourceHandle?: boolean
  showStatusIndicator?: boolean
  isImplemented?: boolean
  sourceHandles?: HandleConfig[]
  targetHandles?: HandleConfig[]
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  isEditing: false,
  selectable: true,
  showTargetHandle: true,
  showSourceHandle: true,
  showStatusIndicator: false,
  sourceHandles: undefined,
  targetHandles: undefined
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
  position: relative; /* Required for handle positioning */
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

/* Override VueFlow's default handle positioning for custom positioned handles */
:deep(.vue-flow__handle[style*="top"]) {
  transform: translateY(-50%) !important;
}
</style>
