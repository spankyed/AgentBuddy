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
  </BaseNode>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { ListenNode } from '@app/api'
import BaseNode, { type HandleConfig } from './BaseNode.vue'

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

// Constants matching SwitchNode pattern
const HEADER_OFFSET = 40
const ROW_HEIGHT = 22

// Compute dynamic exit handles from connected edges
const exitHandles = computed<HandleConfig[]>(() => {
  const connected = props.connectedHandles
  let maxIndex = -1

  if (connected) {
    // Scan for connected exit handles: "nodeId:exit-N"
    for (const key of connected) {
      const match = key.match(new RegExp(`^${props.id}:exit-(\\d+)$`))
      if (match) {
        const idx = parseInt(match[1], 10)
        if (idx > maxIndex) maxIndex = idx
      }
    }
  }

  // Always produce handles 0..maxIndex+1 (one extra unconnected handle)
  const count = maxIndex + 2 // at least 1 handle when maxIndex is -1

  return Array.from({ length: count }, (_, i) => ({
    id: `exit-${i}`,
    label: `Exit ${i + 1}`,
    // When only 1 handle, don't set offsetY so it centers at 50% (default)
    ...(count > 1 && {
      offsetY: HEADER_OFFSET + (i * ROW_HEIGHT) + (ROW_HEIGHT / 2)
    })
  }))
})

// Grow node height when multiple handles exist
const nodeStyle = computed(() => {
  const count = exitHandles.value.length
  if (count <= 1) return {}
  const minHeight = HEADER_OFFSET + count * ROW_HEIGHT + 10
  return { minHeight: `${minHeight}px` }
})
</script>
