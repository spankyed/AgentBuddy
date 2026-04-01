<template>
  <!-- Handle for edge anchoring with connectable=false to disable drag -->
  <Handle
    :id="handleId"
    type="source"
    :position="Position.Right"
    :connectable="false"
    class="source-handle"
    :class="{ 'has-offset': hasCustomOffset }"
    :style="handleStyle"
  />

  <!-- Clickable overlay for our custom click-to-connect behavior -->
  <div
    v-if="!isConnected"
    class="add-handle-overlay"
    :class="{ 'is-selected': isSelected }"
    :style="overlayStyle"
    @pointerdown.stop
    @click.stop="handleClick"
    @dblclick.stop="handleDoubleClick"
    tabindex="0"
  >
    <Plus class="plus-icon" />
  </div>

  <!-- Clickable dot for connected handles - selects the edge -->
  <div
    v-else
    class="connected-handle-dot"
    :style="connectedDotStyle"
    @click.stop="handleConnectedClick"
  />

  <!-- Dropdown for quick node creation (opens on dblclick) -->
  <NodeTypeMenu
    :open="showDropdown"
    side="right"
    align="start"
    @update:open="showDropdown = $event"
    @select="handleSelectNode($event)"
  >
    <template #trigger>
      <!-- Invisible trigger positioned at handle -->
      <div class="dropdown-trigger" :style="overlayStyle" />
    </template>
  </NodeTypeMenu>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Plus } from 'lucide-vue-next'
import NodeTypeMenu from '../components/NodeTypeMenu.vue'

interface Props {
  nodeId: string
  handleId?: string
  offsetY?: number
  offsetPercent?: number
  sourceHandle?: string
  isSelected?: boolean
  isConnected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  handleId: undefined,
  offsetY: undefined,
  offsetPercent: undefined,
  sourceHandle: undefined,
  isSelected: false,
  isConnected: false,
})

const emit = defineEmits<{
  'handle-select': [nodeId: string, handleId?: string]
  'create-connected': [nodeType: string, sourceHandle?: string]
  'edge-select': [nodeId: string, handleId?: string]
}>()

const showDropdown = ref(false)

const hasCustomOffset = computed(() => props.offsetY !== undefined || props.offsetPercent !== undefined)

// Resolve top position: px takes priority, then percent, then default (no style)
const handleStyle = computed(() => {
  if (props.offsetY !== undefined) return { top: `${props.offsetY}px` }
  if (props.offsetPercent !== undefined) return { top: `${props.offsetPercent}%` }
  return {}
})

// Overlay is positioned independently from the Handle
const overlayStyle = computed(() => {
  if (props.offsetY !== undefined) {
    return { top: `${props.offsetY}px`, transform: 'translateY(-50%)' }
  }
  if (props.offsetPercent !== undefined) {
    return { top: `${props.offsetPercent}%`, transform: 'translateY(-50%)' }
  }
  return {}
})

// Connected dot needs rotation included in transform
const connectedDotStyle = computed(() => {
  if (props.offsetY !== undefined) {
    return { top: `${props.offsetY}px`, transform: 'translateY(-50%) rotate(45deg)' }
  }
  if (props.offsetPercent !== undefined) {
    return { top: `${props.offsetPercent}%`, transform: 'translateY(-50%) rotate(45deg)' }
  }
  return {}
})

function handleClick() {
  // If dropdown is open, close it
  if (showDropdown.value) {
    showDropdown.value = false
    return
  }
  // If already selected, open dropdown
  if (props.isSelected) {
    showDropdown.value = true
    return
  }
  // Otherwise, single click selects the handle for click-to-connect
  emit('handle-select', props.nodeId, props.sourceHandle || props.handleId)
}

function handleDoubleClick() {
  // Double click opens the dropdown
  showDropdown.value = true
}

function handleSelectNode(nodeType: string) {
  emit('create-connected', nodeType, props.sourceHandle)
  showDropdown.value = false
}

function handleConnectedClick() {
  // Click on connected handle selects the edge
  emit('edge-select', props.nodeId, props.sourceHandle || props.handleId)
}
</script>

<style scoped>
/* Handle - invisible anchor for edges, let VueFlow position it */
.source-handle {
  width: 1px !important;
  height: 1px !important;
  background: transparent !important;
  border: none !important;
  pointer-events: none !important;
  opacity: 0 !important;
}

/* When handle has custom offset, override VueFlow's transform */
.source-handle.has-offset {
  transform: translateY(-50%) !important;
}

/* Clickable overlay styled as + button - positioned at right edge of node */
.add-handle-overlay {
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  background: #404040;
  border: 1px solid #525252;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: auto;
}

/* Larger invisible hitbox for easier clicking */
.add-handle-overlay::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.add-handle-overlay:hover {
  background: #525252;
  border-color: #737373;
}

/* Clickable dot for connected handles */
.connected-handle-dot {
  position: absolute;
  right: -5px;
  top: 50%;
  transform: translateY(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: #666666;
  border: 1.5px solid #888888;
  border-radius: 1px;
  cursor: pointer;
}

.connected-handle-dot:hover {
  background: #777777;
  border-color: #999999;
}

/* Selected state - ring indicator */
.add-handle-overlay.is-selected {
  background: #3b82f6;
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
}

.add-handle-overlay.is-selected .plus-icon {
  color: white;
}

/* Plus icon */
.plus-icon {
  width: 12px;
  height: 12px;
  color: #d4d4d4;
  pointer-events: none;
}

.add-handle-overlay:hover .plus-icon {
  color: #e5e5e5;
}

/* Invisible dropdown trigger */
.dropdown-trigger {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  pointer-events: none;
}
</style>
