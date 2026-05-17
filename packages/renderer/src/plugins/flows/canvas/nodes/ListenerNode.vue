<template>
  <BaseNode
    v-bind="props"
    :show-target-handle="false"
    :source-handles="exitHandles"
    :show-source-handle="false"
    :can-remove-handles="exitHandles.length > 1"
    :style="nodeStyle"
    @create-connected="(nodeType, sourceHandle) => $emit('create-connected', nodeType, sourceHandle)"
    @handle-select="(nodeId, handleId) => $emit('handle-select', nodeId, handleId)"
    @remove-handle="(nodeId, handleId) => $emit('remove-handle', nodeId, handleId)"
    v-slot="{ dividerClass }"
  >
    <div v-if="subtitle" :class="['mt-1.5 pt-1.5 border-t flex items-center justify-center', dividerClass]">
      <span class="text-[10px] text-neutral-400 font-mono truncate">{{ subtitle }}</span>
    </div>

    <!-- Exit rows — only shown when multiple exits exist -->
    <div v-if="exitHandles.length > 1" class="exit-rows mt-1.5 pt-1.5 border-t border-neutral-700/50">
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
          exit {{ i + 1 }}
        </span>
      </div>
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { NodeKind } from '@app/api'
import BaseNode, { type HandleConfig } from './BaseNode.vue'
import { NODE_DIMENSIONS } from './node-dimensions'

interface NodeData {
  label: string
  scope?: 'global' | 'local' | 'entry'
  eventType?: string
  nodeType?: NodeKind
  cronExpression?: string
}

interface Props extends NodeProps<NodeData> {
  connectedHandles?: Set<string>
}

const props = defineProps<Props>()

defineEmits<{
  'create-connected': [nodeType: string, sourceHandle?: string]
  'handle-select': [nodeId: string, handleId?: string]
  'remove-handle': [nodeId: string, handleId?: string]
}>()

const { rowHeight: ROW_HEIGHT, baseHeaderOffset: BASE_HEADER_OFFSET, eventTypeHeight: EVENT_TYPE_HEIGHT } = NODE_DIMENSIONS.listener

/**
 * Convert a cron expression to a human-readable string.
 * Handles common patterns; falls back to raw expression for complex ones.
 */
function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr

  const [min, hour, dom, mon, dow] = parts

  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every minute'

  // Step expressions: */N * * * * or */N in hour field
  const minStep = min.match(/^\*\/(\d+)$/)
  if (minStep && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Every ${minStep[1]} min`
  const hourStep = hour.match(/^\*\/(\d+)$/)
  if (min !== '*' && hourStep && dom === '*' && mon === '*' && dow === '*') return `Every ${hourStep[1]}h at :${min.padStart(2, '0')}`

  if (hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Hourly at :${min.padStart(2, '0')}`
  if (dom === '*' && mon === '*' && dow === '*') return `Daily at ${hour}:${min.padStart(2, '0')}`

  const dayNames: Record<string, string> = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun' }
  if (dom === '*' && mon === '*' && dow !== '*') {
    const days = dow.split(',').map(d => dayNames[d] || d).join(', ')
    return `${days} at ${hour}:${min.padStart(2, '0')}`
  }

  if (mon === '*' && dow === '*') return `Day ${dom} at ${hour}:${min.padStart(2, '0')}`

  return expr
}

const isSchedule = computed(() => props.data.nodeType === 'schedule')
const subtitle = computed(() => {
  if (isSchedule.value && props.data.cronExpression) return cronToHuman(props.data.cronExpression)
  return props.data.eventType || ''
})

const hasSubtitle = computed(() => !!subtitle.value)
const headerOffset = computed(() => BASE_HEADER_OFFSET + (hasSubtitle.value ? EVENT_TYPE_HEIGHT : 0))

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
  const offset = headerOffset.value
  return Array.from({ length: count }, (_, i) => ({
    id: `exit-${i}`,
    label: `Exit ${i + 1}`,
    offsetY: offset + (i * ROW_HEIGHT) + (ROW_HEIGHT / 2)
  }))
})

// Grow the node to fit exit rows
const nodeStyle = computed(() => {
  const count = exitHandles.value.length
  if (count <= 1) return {}
  return { minHeight: `${headerOffset.value + count * ROW_HEIGHT + 10}px` }
})

</script>

<style scoped>
.exit-row {
  height: 22px;
  min-height: 22px;
}
</style>
