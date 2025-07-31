<template>
  <BaseNode v-bind="props">
    <div v-if="data.actionId" class="flex items-center gap-1.5">
      <svg class="w-2.5 h-2.5 text-neutral-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <span class="text-[10px] text-neutral-300 font-mono truncate">{{ data.actionId }}</span>
    </div>
    
    <div v-if="data.params && Object.keys(data.params).length > 0" class="mt-1 text-[9px] text-neutral-500">
      <span class="uppercase tracking-wide">{{ Object.keys(data.params).length }} param{{ Object.keys(data.params).length !== 1 ? 's' : '' }}</span>
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { ActionNode } from '@app/api'
import BaseNode from './BaseNode.vue'

interface NodeData extends Partial<ActionNode> {
  label: string
  actionId?: string
  params?: Record<string, any>
}

const props = defineProps<NodeProps<NodeData>>()
</script>
