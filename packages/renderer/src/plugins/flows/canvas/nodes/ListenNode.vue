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

// Minimum spacing between handles (px). If the node's natural height can't
// fit all handles at this spacing we grow it just enough.
const HANDLE_SPACING = 20

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

  // Distribute handles evenly using percentage positions.
  // Each handle gets a band of 1/(count+1) so there's equal padding
  // above the first and below the last.
  return Array.from({ length: count }, (_, i) => ({
    id: `exit-${i}`,
    label: `Exit ${i + 1}`,
    offsetPercent: ((i + 1) / (count + 1)) * 100
  }))
})

// Only grow the node when handles can't fit at minimum spacing
const nodeStyle = computed(() => {
  const count = exitHandles.value.length
  if (count <= 1) return {}
  const needed = (count + 1) * HANDLE_SPACING
  return { minHeight: `${needed}px` }
})
</script>
