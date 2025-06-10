<template>
  <div class="node" :style="{ borderColor: data.color || '#888' }">
    <Handle
      type="target"
      :position="Position.Top"
      :id="`${id}-in`"
      class="handle"
    />
    <div class="label">{{ data.label }}</div>
    <div class="type">FIRE</div>
  </div>
</template>

<script setup lang="ts">
import { Position, Handle, type NodeProps } from '@vue-flow/core'
import type { FireNode } from '@abuddy/api'

interface NodeData extends Partial<FireNode> {
  label: string
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
