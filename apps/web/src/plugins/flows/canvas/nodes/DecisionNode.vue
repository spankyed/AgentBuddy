<template>
  <BaseNode v-bind="props" :is-active="data.isSelected">
    <div v-if="data.conditions && data.conditions.length > 0" class="space-y-1">
      <div class="flex items-center gap-1.5 text-[9px] text-neutral-500 uppercase tracking-wide">
        <svg class="w-2.5 h-2.5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        Conditions
      </div>
      
      <div class="pl-4 space-y-1">
        <div v-for="(condition, i) in data.conditions" :key="i" class="flex items-start gap-1.5">
          <span class="inline-flex items-center justify-center w-3 h-3 text-[8px] font-bold rounded-full bg-orange-500/20 text-orange-300 flex-shrink-0 mt-0.5">
            {{ i + 1 }}
          </span>
          <span class="text-[10px] text-neutral-300 break-words">{{ condition.label || condition.expr }}</span>
        </div>
        
        <div v-if="data.elseLabel" class="flex items-start gap-1.5">
          <span class="inline-flex items-center justify-center px-1 text-[8px] font-bold rounded bg-orange-500/20 text-orange-300 flex-shrink-0 mt-0.5">
            ELSE
          </span>
          <span class="text-[10px] text-neutral-300 break-words">{{ data.elseLabel }}</span>
        </div>
      </div>
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { DecisionNode } from '@abuddy/api'
import BaseNode from './BaseNode.vue'

interface NodeData extends Partial<DecisionNode> {
  label: string
  conditions?: Array<{ expr: string; label?: string }>
  elseLabel?: string
  isSelected?: boolean
}

const props = defineProps<NodeProps<NodeData>>()
</script>
