<template>
  <BaseNode v-bind="props" :show-target-handle="false">
    <template #badge>
      <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
        {{ scopeLabel }}
      </span>
    </template>

    <div v-if="data.eventType" class="flex items-center gap-1.5">
      <svg class="w-2.5 h-2.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
      </svg>
      <span class="text-[10px] text-neutral-300 font-mono truncate">{{ data.eventType }}</span>
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { ListenNode } from '@app/api'
import BaseNode from './BaseNode.vue'

interface NodeData extends Partial<ListenNode> {
  label: string
  scope?: 'global' | 'local' | 'entry'
  eventType?: string
}

const props = defineProps<NodeProps<NodeData>>()

const scopeLabel = computed(() => {
  switch (props.data.scope) {
    case 'global': return 'GLOBAL'
    case 'local': return 'LOCAL'
    case 'entry': return 'ENTRY'
    default: return 'GLOBAL'
  }
})
</script>