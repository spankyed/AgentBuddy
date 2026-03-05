<template>
  <BaseNode v-bind="props" :show-source-handle="false">
    <div v-if="data.eventType" class="mt-1.5 pt-1.5 border-t border-neutral-700/50 flex items-center justify-center">
      <span class="text-[10px] text-neutral-400 font-mono truncate">{{ data.eventType }}</span>
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { FireNode } from '@app/api'
import { BaseNode } from '@/core/components/flow-nodes'

interface NodeData extends Partial<FireNode> {
  label: string
  eventType?: string
  scope?: 'local' | 'global'
}

const props = defineProps<NodeProps<NodeData>>()
</script>
