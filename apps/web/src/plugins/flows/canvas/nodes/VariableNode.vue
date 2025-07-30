<template>
  <BaseNode v-bind="props">
    <!-- Add any variable-specific content here if needed -->
  </BaseNode>
</template>

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { NodeKind } from '@abuddy/api'
import BaseNode from './BaseNode.vue'

interface NodeData {
  label: string
  nodeType: NodeKind
  [key: string]: any
}

const props = defineProps<NodeProps<NodeData>>()
</script>
