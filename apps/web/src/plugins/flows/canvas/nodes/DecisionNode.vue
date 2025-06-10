<template>
  <div class="node" :style="{ borderColor: data.color || '#888' }">
    <Handle
      type="target"
      :position="Position.Top"
      :id="`${id}-in`"
      class="handle"
      :isValidConnection="({ target }) => {
        const edges = useVueFlow().edges
        return edges.value.filter(e => e.target === target).length === 0
      }"    
    />
    <div class="label">{{ data.label }}</div>
    <div class="type">DECISION</div>
    <Handle
      v-for="(condition, i) in data.conditions"
      :key="i"
      type="source"
      :position="Position.Bottom"
      :id="`${id}-out-${i}`"
      class="handle"
    />
    <Handle
      v-if="data.elseLabel"
      type="source"
      :position="Position.Bottom"
      :id="`${id}-out-else`"
      class="handle"
    />
  </div>
</template>

<script setup lang="ts">
import { Position, Handle, type NodeProps, useVueFlow } from '@vue-flow/core'
import type { DecisionNode } from '@abuddy/api'

interface NodeData extends Partial<DecisionNode> {
  label: string
  conditions: Array<{ expr: string; label?: string }>
  elseLabel?: string
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
