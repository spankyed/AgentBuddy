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
/**
 * Shared canvas component for trigger nodes (listener, schedule).
 *
 * Trigger nodes share identical structure: no input handle, dynamic exit
 * handles, and an optional subtitle below the label. The only difference
 * is the subtitle source — eventType for listeners, cronExpression for
 * schedules. Both are configured as `component: 'TriggerNode'` in
 * node-config.ts.
 */
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import BaseNode, { type HandleConfig } from './BaseNode.vue'
import { NODE_DIMENSIONS } from './node-dimensions'
import { cronToHuman } from '../../helpers/cron-utils'

interface NodeData {
  label: string
  eventType?: string
  cronExpression?: string
  [key: string]: any
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


const subtitle = computed(() => {
  if (props.data.cronExpression) return cronToHuman(props.data.cronExpression)
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
    return [{ id: 'exit-0', label: 'Exit 1' }]
  }

  const offset = headerOffset.value
  return Array.from({ length: count }, (_, i) => ({
    id: `exit-${i}`,
    label: `Exit ${i + 1}`,
    offsetY: offset + (i * ROW_HEIGHT) + (ROW_HEIGHT / 2)
  }))
})

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
