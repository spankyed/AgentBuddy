<template>
  <BaseNode v-bind="props" :show-source-handle="false">
    <div v-if="data.eventType" class="text-[10px] text-amber-400 font-mono truncate">
      {{ data.eventType }}
    </div>
    <div v-if="data.scope" class="text-[10px] text-neutral-400">
      Scope: {{ data.scope }}
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { FireNode } from '@abuddy/api'
import BaseNode from './BaseNode.vue'

interface NodeData extends Partial<FireNode> {
  label: string
  eventType?: string
  scope?: 'local' | 'global'
}

const props = defineProps<NodeProps<NodeData>>()
</script>
