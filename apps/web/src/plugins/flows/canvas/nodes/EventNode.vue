<template>
  <div class="event-node" :style="{ borderColor: data.color || '#888' }">
    <div class="label">{{ data.label }}</div>
  </div>
</template>

<script setup lang="ts">
import { Position, type NodeProps } from '@vue-flow/core'

interface EventNodeData {
  label: string
  color?: string
}

defineProps<NodeProps<EventNodeData>>()
</script>

<style scoped>
.event-node {
  padding: 10px;
  border-radius: 5px;
  border: 2px solid;
  background: #1f1f1f;
  color: #fff;
  min-width: 150px;
}
.label {
  text-align: center;
  font-size: 12px;
}
</style>
