<template>
  <div class="node" :style="{ borderColor: data.color || '#888' }">
    <div class="label">{{ data.label }}</div>
    <div class="type">LISTEN ({{ data.mode }})</div>
    <Handle
      v-for="i in outputHandles"
      :key="i"
      type="source"
      :position="Position.Bottom"
      :id="`${id}-out-${i}`"
      class="handle"
    />
  </div>
</template>

<script setup lang="ts">
import { Position, Handle, type NodeProps } from '@vue-flow/core'
import type { ListenNode } from '@abuddy/api'

interface NodeData extends Partial<ListenNode> {
  label: string
  mode: 'entry' | 'internal'
}

defineProps<NodeProps<NodeData>>()

// Listen nodes can have multiple outputs but no inputs
const outputHandles = 3 // Default to 3 possible outputs
</script>

<style scoped>
.node {
  padding: 10px;
  border-radius: 5px;
  border: 2px solid;
  background: #1f1f1f;
  color: #fff;
  min-width: 150px;
}
.label {
  text-align: center;
  font-size: 14px;
  margin-bottom: 4px;
}
.type {
  text-align: center;
  font-size: 10px;
  opacity: 0.7;
}
</style>
