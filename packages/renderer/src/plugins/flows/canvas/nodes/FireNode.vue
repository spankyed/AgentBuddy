<template>
  <BaseNode v-bind="props" :show-source-handle="false">
    <div class="space-y-1">
      <div v-if="data.eventType" class="flex items-center gap-1.5">
        <svg class="w-2.5 h-2.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span class="text-[10px] text-amber-300 font-mono truncate">{{ data.eventType }}</span>
      </div>
      
      <div v-if="data.scope" class="flex items-center gap-1.5">
        <span class="text-[9px] text-neutral-500 uppercase tracking-wide">Scope:</span>
        <span class="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium uppercase"
              :class="data.scope === 'global' ? 'bg-amber-500/20 text-amber-300' : 'bg-neutral-700/50 text-neutral-400'">
          {{ data.scope }}
        </span>
      </div>
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { FireNode } from '@app/api'
import BaseNode from './BaseNode.vue'

interface NodeData extends Partial<FireNode> {
  label: string
  eventType?: string
  scope?: 'local' | 'global'
}

const props = defineProps<NodeProps<NodeData>>()
</script>
