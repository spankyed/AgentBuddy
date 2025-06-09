<template>
  <div class="step-node" :style="{ borderColor: data.color || '#888' }">
    <Handle
      type="target"
      :position="Position.Top"
      :id="`${id}-top`"
      class="handle"
    />
    <div class="label">{{ data.label }}</div>
    <div class="type">{{ data.stepType }}</div>
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

interface StepNodeData {
  label: string
  stepType: string
  color?: string
}

defineProps<NodeProps<StepNodeData>>()
</script>

<style scoped>
.step-node {
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
