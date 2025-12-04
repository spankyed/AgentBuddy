<template>
  <!-- Handle for edge anchoring with connectable=false to disable drag -->
  <Handle
    :id="handleId"
    type="source"
    :position="Position.Right"
    :connectable="false"
    class="source-handle"
    :class="{ 'has-offset': offsetY !== undefined }"
    :style="offsetY !== undefined ? { top: `${offsetY}px` } : {}"
  />

  <!-- Clickable overlay for our custom click-to-connect behavior (hidden when connected) -->
  <div
    v-if="!isConnected"
    class="add-handle-overlay"
    :class="{ 'is-selected': isSelected }"
    :style="overlayStyle"
    @click.stop="handleClick"
    @dblclick.stop="handleDoubleClick"
    tabindex="0"
  >
    <Plus class="plus-icon" />
  </div>

  <!-- Dropdown for quick node creation (opens on dblclick) -->
  <DropdownMenuRoot
    :open="showDropdown"
    @update:open="showDropdown = $event"
  >
    <DropdownMenuTrigger as-child>
      <!-- Invisible trigger positioned at handle -->
      <div class="dropdown-trigger" :style="overlayStyle" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        side="right"
        align="start"
        :side-offset="8"
        class="z-50 overflow-hidden border rounded-lg shadow-2xl w-48 bg-neutral-900 border-neutral-700"
      >
        <div class="p-1.5 max-h-80 overflow-y-auto">
          <DropdownMenuItem
            v-for="item in paletteItems"
            :key="item.type"
            @select="handleSelectNode(item.type)"
            class="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 rounded-md cursor-pointer transition-colors hover:bg-neutral-800 hover:text-white outline-none focus:bg-neutral-800 focus:text-white"
          >
            <component :is="item.icon" class="flex-shrink-0 w-4 h-4" />
            <span class="font-medium">{{ item.label }}</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Plus } from 'lucide-vue-next'
import { getPaletteItems, getNodeConfig } from './node-config'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'

interface Props {
  nodeId: string
  handleId?: string
  offsetY?: number
  sourceHandle?: string
  isSelected?: boolean
  isConnected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  handleId: undefined,
  offsetY: undefined,
  sourceHandle: undefined,
  isSelected: false,
  isConnected: false,
})

const emit = defineEmits<{
  'handle-select': [nodeId: string, handleId?: string]
  'create-connected': [nodeType: string, sourceHandle?: string]
}>()

// Filter out nodes that can't receive inputs (like listen nodes which are entry points)
const paletteItems = getPaletteItems().filter(item => {
  const config = getNodeConfig(item.type)
  return config && config.connectionRules.inputs !== 0
})

const showDropdown = ref(false)

// Overlay is positioned independently from the Handle
const overlayStyle = computed(() => {
  if (props.offsetY !== undefined) {
    return {
      top: `${props.offsetY}px`,
      transform: 'translateY(-50%)'
    }
  }
  return {}
})

function handleClick() {
  // Single click selects the handle for click-to-connect
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
  color: #a3a3a3;
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
