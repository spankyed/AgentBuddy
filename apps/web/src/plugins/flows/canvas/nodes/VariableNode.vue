<template>
  <div class="node" :style="{ borderColor: data.color || '#888' }">
    <Handle
      v-if="data.mode !== 'create'"
      type="target"
      :position="Position.Left"
      :id="`${id}-in`"
      class="handle"
      :isValidConnection="({ target }) => {
        const edges = useVueFlow().edges
        return edges.value.filter(e => e.target === target).length === 0
      }"    
    />
    <div class="label">{{ data.label }}</div>
    <div class="type">VARIABLE ({{ data.mode }})</div>
    <Handle
      type="source"
      :position="Position.Right"
      :id="`${id}-out`"
      class="handle"
      :isValidConnection="({ source }) => {
        const edges = useVueFlow().edges
        return edges.value.filter(e => e.source === source).length === 0
      }"    
    />
  </div>
</template>

<script setup lang="ts">
import { Position, Handle, type NodeProps, useVueFlow } from '@vue-flow/core'

interface NodeData {
  label: string
  mode: 'create' | 'update'
  color?: string
}

defineProps<NodeProps<NodeData>>()
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
