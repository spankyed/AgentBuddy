<template>
  <BaseNode
    v-bind="props"
    :show-target-handle="false"
    :source-handles="exitHandles"
    :show-source-handle="false"
    :style="nodeStyle"
    @create-connected="(nodeType, sourceHandle) => $emit('create-connected', nodeType, sourceHandle)"
    @handle-select="(nodeId, handleId) => $emit('handle-select', nodeId, handleId)"
  >
    <div v-if="data.eventType" class="mt-1.5 pt-1.5 border-t border-neutral-700/50 flex items-center justify-center">
      <span class="text-[10px] text-neutral-400 font-mono truncate">{{ data.eventType }}</span>
    </div>

    <!-- Exit rows — only shown when multiple exits exist -->
    <div v-if="exitHandles.length > 1" :class="['exit-rows mt-1.5 pt-1.5 border-t', dividerClass]">
      <div
        v-for="(handle, i) in exitHandles"
        :key="handle.id"
        class="exit-row flex items-center gap-2 pr-1"
      >
        <span
          class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-semibold rounded bg-neutral-600/60 text-neutral-300"
        >
          {{ i + 1 }}
        </span>
        <span class="text-[11px] text-neutral-400 truncate flex-1">
          step {{ i + 1 }}
        </span>
      </div>
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { ListenNode } from '@app/api'
import BaseNode, { type HandleConfig } from './BaseNode.vue'
import { getNodeDividerClass } from './node-config'

interface NodeData extends Partial<ListenNode> {
  label: string
  scope?: 'global' | 'local' | 'entry'
  eventType?: string
}

interface Props extends NodeProps<NodeData> {
  connectedHandles?: Set<string>
}

const props = defineProps<Props>()

defineEmits<{
  'create-connected': [nodeType: string, sourceHandle?: string]
  'handle-select': [nodeId: string, handleId?: string]
}>()

// Row height for handle positioning (matches .exit-row height)
const ROW_HEIGHT = 22
// Header offset: node padding (8px) + header height (~24px) + divider margin (8px) + eventType area (~3px)
const HEADER_OFFSET = 43

// Compute dynamic exit handles from connected edges
const exitHandles = computed<HandleConfig[]>(() => {
  const connected = props.connectedHandles
  let maxIndex = -1

  if (connected) {
    for (const key of connected) {
      const match = key.match(new RegExp(`^${props.id}:exit-(\\d+)$`))
      if (match) {
        const idx = parseInt(match[1], 10)
        if (idx > maxIndex) maxIndex = idx
      }
    }
  }

  const count = maxIndex + 2 // at least 1

  if (count === 1) {
    // Single handle — no offsetY, BaseNode centers it at 50%
    return [{ id: 'exit-0', label: 'Exit 1' }]
  }

  // Pixel-based positioning aligned with exit rows
  return Array.from({ length: count }, (_, i) => ({
    id: `exit-${i}`,
    label: `Exit ${i + 1}`,
    offsetY: HEADER_OFFSET + (i * ROW_HEIGHT) + (ROW_HEIGHT / 2)
  }))
})

// Grow the node to fit exit rows
const nodeStyle = computed(() => {
  const count = exitHandles.value.length
  if (count <= 1) return {}
  return { minHeight: `${HEADER_OFFSET + count * ROW_HEIGHT + 10}px` }
})

const dividerClass = computed(() => getNodeDividerClass('listen'))
</script>

<style scoped>
.exit-row {
  height: 22px;
  min-height: 22px;
}
</style>
