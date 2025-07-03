<template>
  <BaseNode v-bind="props">
    <div v-if="data.conditions && data.conditions.length > 0" class="mt-1 space-y-1">
      <div v-for="(condition, i) in data.conditions" :key="i" class="text-[10px]">
        <span class="text-orange-400">{{ i + 1 }}.</span>
        <span class="text-neutral-400">{{ condition.label || condition.expr }}</span>
      </div>
      <div v-if="data.elseLabel" class="text-[10px]">
        <span class="text-orange-400">else:</span>
        <span class="text-neutral-400">{{ data.elseLabel }}</span>
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
}

const props = defineProps<NodeProps<NodeData>>()
</script>
