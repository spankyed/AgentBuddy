<template>
  <BaseNode v-bind="props" :show-target-handle="false">
    <div class="text-[10px] text-blue-400 font-mono">
      {{ data.mode === 'entry' ? 'ENTRY' : 'INTERNAL' }}
    </div>
    <div v-if="data.eventType" class="text-[10px] text-neutral-400 truncate">
      {{ data.eventType }}
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { ListenNode } from '@abuddy/api'
import BaseNode from './BaseNode.vue'

interface NodeData extends Partial<ListenNode> {
  label: string
  mode: 'entry' | 'internal'
  eventType?: string
}

const props = defineProps<NodeProps<NodeData>>()
</script>
