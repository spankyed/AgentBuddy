<template>
  <div class="event-node" :style="{ borderColor: data.color || '#888' }">
    <Handle
      type="target"
      :position="Position.Top"
      :id="`${id}-top`"
      class="handle"
    />
    <div class="label">{{ data.label }}</div>
    <Handle
      type="source"
      :position="Position.Bottom"
      :id="`${id}-bottom`"
      class="handle"
    />
  </div>
</template>

<script setup lang="ts">
import { Position, Handle, type NodeProps } from '@vue-flow/core'

interface EventNodeData {
  label: string
  color?: string
}

defineProps<NodeProps<EventNodeData>>()
</script>

<style scoped>
.event-node {
  padding: 10px;
  border-radius: 20px;
  width: 150px;
  font-size: 12px;
  color: #222;
  text-align: center;
  border: 1px solid #1a192b;
  background-color: white;
}

.label {
  text-align: center;
  font-size: 12px;
}
</style>
