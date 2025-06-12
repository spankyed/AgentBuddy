<template>
  <div class="node" :style="{ '--node-color': data.color || '#4a9eff' }">
    <div class="antenna">
      <div class="dot"></div>
      <div class="wave"></div>
    </div>
    <div class="label">{{ data.label }}</div>
    <div class="type">LISTEN ({{ data.mode }})</div>
    <Handle
      type="source"
      :position="Position.Right"
      :id="`${id}-out`"
      class="handle"
      :isValidConnection="({ source }) => {
        const edges = useVueFlow().edges
        return edges.value.filter(e => e.source === source).length < 3
      }"    
    />
  </div>
</template>

<script setup lang="ts">
import { Position, Handle, type NodeProps, useVueFlow } from '@vue-flow/core'
import type { ListenNode } from '@abuddy/api'

interface NodeData extends Partial<ListenNode> {
  label: string
  mode: 'entry' | 'internal'
}

defineProps<NodeProps<NodeData>>()
</script>

<style scoped>
.node {
  padding: 10px;
  border-radius: 8px;
  background: linear-gradient(45deg, #1f1f1f, #2a2a2a);
  color: #fff;
  min-width: 150px;
  position: relative;
  box-shadow: 0 0 15px rgba(var(--node-color-rgb), 0.15);
  border: 2px solid var(--node-color);
}

.antenna {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.dot {
  width: 6px;
  height: 6px;
  background: var(--node-color);
  border-radius: 50%;
}

.wave {
  width: 2px;
  height: 8px;
  background: var(--node-color);
}

.label {
  text-align: center;
  font-size: 14px;
  margin-bottom: 4px;
  font-weight: 500;
}

.type {
  text-align: center;
  font-size: 10px;
  opacity: 0.7;
  color: var(--node-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Convert hex color to RGB for box-shadow */
.node {
  --node-color-rgb: calc((0x${() => props.data?.color?.slice(1, 3) || '4a'}) * 1),
                     calc((0x${() => props.data?.color?.slice(3, 5) || '9e'}) * 1),
                     calc((0x${() => props.data?.color?.slice(5, 7) || 'ff'}) * 1);
}
</style>
