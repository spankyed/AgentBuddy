<template>
  <BaseNode v-bind="props" :show-source-handle="false" v-slot="{ dividerClass }">
    <div v-if="data.eventType" :class="['mt-1.5 pt-1.5 border-t flex items-center justify-center', dividerClass]">
      <span class="text-[10px] text-neutral-400 font-mono truncate">{{ data.eventType }}</span>
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
