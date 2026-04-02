<template>
  <div
    class="flow-node group"
    :class="[
      nodeClasses,
      {
        'ring-2 ring-blue-400/70 shadow-lg shadow-blue-500/20': isEditing,
        'ring-2 ring-white/40 shadow-md shadow-white/5': !isEditing && (isActive || selected),
        'cursor-pointer': selectable,
      }
    ]"
  >
    <!-- Main content -->
    <div class="relative z-10">
      <!-- Header -->
      <div class="flex items-center">
        <!-- data-action="open-form" -->
        <component
          :is="nodeIcon"
          class="w-3.5 h-3.5 mr-1 flex-shrink-0 opacity-80"
          :class="iconTextColor"
        />
        <div class="flex-1 flex justify-center pr-1">
          <span
            class="text-[13px] font-medium text-neutral-200 cursor-pointer"

          >{{ data.label }}</span>
        </div>
      </div>

      <!-- Custom content slot or auto-rendered content -->
      <slot>
        <!-- Auto-render eventType if present -->
        <div v-if="data.eventType" :class="['mt-1.5 pt-1.5 border-t flex items-center justify-center', dividerClass]">
          <span class="text-[10px] text-neutral-400 font-mono truncate">{{ data.eventType }}</span>
        </div>
        <!-- Auto-render params count if present -->
        <div v-else-if="data.params && Object.keys(data.params).length > 0" :class="['mt-1.5 pt-1.5 border-t flex items-center justify-center', dividerClass]">
          <span class="text-[10px] text-neutral-400 uppercase tracking-wide">{{ Object.keys(data.params).length }} param{{ Object.keys(data.params).length !== 1 ? 's' : '' }}</span>
        </div>
      </slot>

    </div>

    <!-- Status indicator (if provided) -->
    <div v-if="showStatusIndicator && data.status" class="absolute -top-1.5 -right-1.5">
      <div class="relative">
        <div
          class="w-3.5 h-3.5 rounded-full border border-neutral-800/50"
          :class="statusClasses"
        />
        <div
          v-if="data.status === 'active'"
          class="absolute inset-0 w-3.5 h-3.5 rounded-full animate-ping"
          :class="statusClasses"
        />
      </div>
    </div>

    <!-- Connection handles -->
    <!-- Dynamic target handles (explicit override only) -->
    <template v-if="targetHandles && targetHandles.length > 0">
      <Handle
        v-for="handle in targetHandles"
        :key="handle.id"
        :id="handle.id"
        type="target"
        :position="Position.Left"
        :style="{ top: handle.offsetY ? `${handle.offsetY}px` : '50%' }"
        class="!w-1 !h-1 !bg-transparent !border-none !left-0"
      />
    </template>
    <!-- Default single target handle -->
    <Handle
      v-else-if="effectiveShowTargetHandle"
      type="target"
      :position="Position.Left"
      class="!w-1 !h-1 !bg-transparent !border-none !left-0"
    />

    <!-- Dynamic source handles (AddHandle with + icon) - only in edit mode -->
    <template v-if="editable && sourceHandles && sourceHandles.length > 0">
      <AddHandle
        v-for="handle in sourceHandles"
        :key="handle.id"
        :node-id="id"
        :handle-id="handle.id"
        :offset-y="handle.offsetY"
        :offset-percent="handle.offsetPercent"
        :source-handle="handle.id"
        :is-selected="isHandleSelected(handle.id)"
        :is-connected="isHandleConnected(handle.id)"
        @create-connected="(nodeType, sourceHandle) => $emit('create-connected', nodeType, sourceHandle)"
        @handle-select="(nodeId, handleId) => $emit('handle-select', nodeId, handleId)"
        @edge-select="(nodeId, handleId) => $emit('edge-select', nodeId, handleId)"
      />
    </template>
    <!-- Default single source handle (AddHandle with + icon) - only in edit mode -->
    <AddHandle
      v-else-if="editable && effectiveShowSourceHandle"
      :node-id="id"
      :is-selected="isHandleSelected()"
      :is-connected="isHandleConnected()"
      @create-connected="(nodeType, sourceHandle) => $emit('create-connected', nodeType, sourceHandle)"
      @handle-select="(nodeId, handleId) => $emit('handle-select', nodeId, handleId)"
      @edge-select="(nodeId, handleId) => $emit('edge-select', nodeId, handleId)"
    />
    <!-- Plain invisible source handle for edge anchoring (view mode) -->
    <Handle
      v-else-if="!editable && effectiveShowSourceHandle"
      type="source"
      :position="Position.Right"
      class="!w-1 !h-1 !bg-transparent !border-none !right-0"
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
import { getNodeClasses, getNodeStatusClasses, getNodeIconTextColor, getNodeConfig, getNodeDividerClass } from './node-config'
import AddHandle from './AddHandle.vue'
import type { NodeKind } from '@app/api'

export interface HandleConfig {
  id: string
  label?: string
  offsetY?: number       // Vertical offset in pixels from top of node
  offsetPercent?: number  // Vertical offset as percentage (0-100) from top of node
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
  // When false, shows plain invisible handles instead of interactive AddHandle
  editable?: boolean
  sourceHandles?: HandleConfig[]
  targetHandles?: HandleConfig[]
  // Handle selection for click-to-connect
  selectedHandle?: { nodeId: string; handleId?: string }
  // Set of connected handles: "nodeId" or "nodeId:handleId"
  connectedHandles?: Set<string>
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  isEditing: false,
  selectable: true,
  showTargetHandle: true,
  showSourceHandle: true,
  showStatusIndicator: false,
  editable: true,
  sourceHandles: undefined,
  targetHandles: undefined,
  selectedHandle: undefined,
  connectedHandles: undefined,
})

defineEmits<{
  'create-connected': [nodeType: string, sourceHandle?: string]
  'handle-select': [nodeId: string, handleId?: string]
  'edge-select': [nodeId: string, handleId?: string]
}>()

// Check if a specific handle is selected
function isHandleSelected(handleId?: string): boolean {
  if (!props.selectedHandle) return false
  if (props.selectedHandle.nodeId !== props.id) return false
  // If no handleId specified on the handle, check if selection has no handleId
  if (!handleId) return !props.selectedHandle.handleId
  return props.selectedHandle.handleId === handleId
}

// Check if a specific handle is connected to an edge
function isHandleConnected(handleId?: string): boolean {
  if (!props.connectedHandles) return false
  if (handleId) {
    return props.connectedHandles.has(`${props.id}:${handleId}`)
  }
  return props.connectedHandles.has(props.id)
}

const nodeType = computed(() => props.data.nodeType || 'action')
const nodeConfig = computed(() => getNodeConfig(nodeType.value))

const effectiveShowSourceHandle = computed(() =>
  nodeConfig.value?.connectionRules.outputs === 0 ? false : props.showSourceHandle
)
const effectiveShowTargetHandle = computed(() =>
  nodeConfig.value?.connectionRules.inputs === 0 ? false : props.showTargetHandle
)

const nodeClasses = computed(() => getNodeClasses(nodeType.value))
const nodeIcon = computed(() => nodeConfig.value?.icon)
const iconTextColor = computed(() => getNodeIconTextColor(nodeType.value))
const dividerClass = computed(() => getNodeDividerClass(nodeType.value))

const statusClasses = computed(() => {
  if (!props.data.status) return ''
  return getNodeStatusClasses(props.data.status, 'simple') as string
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

/* Larger invisible hitbox for easier clicking */
:deep(.handle-hitbox)::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

/* Override VueFlow's default handle positioning for custom positioned handles */
:deep(.vue-flow__handle[style*="top"]) {
  transform: translateY(-50%) !important;
}
</style>
