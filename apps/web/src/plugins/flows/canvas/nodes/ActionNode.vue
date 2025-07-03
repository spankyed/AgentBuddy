<template>
  <BaseNode v-bind="props">
    <div v-if="data.actionName" class="text-[10px] text-neutral-400 font-mono truncate">
      {{ data.actionName }}
    </div>
  </BaseNode>
</template>

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { ActionNode } from '@abuddy/api'
import BaseNode from './BaseNode.vue'

interface NodeData extends Partial<ActionNode> {
  label: string
  actionName?: string
}

const props = defineProps<NodeProps<NodeData>>()
</script>
