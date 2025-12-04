<template>
  <g>
    <!-- Invisible wider path for easier selection -->
    <path
      :d="edgePath"
      :style="{ strokeWidth: 20, stroke: 'transparent', fill: 'none' }"
    />
    <!-- Selection highlight -->
    <path
      v-if="props.selected"
      :d="edgePath"
      :style="{ strokeWidth: 6, stroke: '#3b82f6', fill: 'none', opacity: 0.4 }"
    />
    <!-- Visible edge -->
    <path
      :d="edgePath"
      :style="{ strokeWidth: props.selected ? 2 : 1.5, stroke: props.selected ? '#3b82f6' : '#888', fill: 'none' }"
      :marker-end="`url(#${MarkerType.Arrow})`"
    />
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MarkerType, type EdgeProps, useVueFlow } from '@vue-flow/core'
import { LAYOUT_CONFIG } from '@/plugins/flows/canvas/layout-utils'

const props = defineProps<EdgeProps>()
const { getEdges } = useVueFlow()

const edgePath = computed(() => {
  const { sourceX, sourceY, targetX, targetY, id, target } = props
  const { edge } = LAYOUT_CONFIG

  // Find sibling edges - sort by sourceY for geometric consistency (prevents crossing)
  const siblings = getEdges.value
    .filter(e => e.target === target)
    .sort((a, b) => (a.sourceY ?? 0) - (b.sourceY ?? 0))
  const hasSiblings = siblings.length >= 2

  const vDist = Math.abs(targetY - sourceY)

  // Straight line if no vertical distance and no siblings
  if (vDist < edge.straightThreshold && !hasSiblings) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  }

  // Single bend point - halfway between source and target horizontally
  const bendX = sourceX + Math.min(edge.maxBendOffset, (targetX - sourceX) / 2)
  const radius = Math.min(edge.cornerRadius, vDist / 2.5, (targetX - sourceX) / 4)
  const dir = targetY > sourceY ? 1 : -1

  let path = `M ${sourceX} ${sourceY}`

  // Simple L-shaped path with rounded corner
  if (vDist >= edge.straightThreshold) {
    path += ` L ${bendX - radius} ${sourceY}`
    path += ` Q ${bendX} ${sourceY} ${bendX} ${sourceY + dir * radius}`
    path += ` L ${bendX} ${targetY - dir * radius}`
    path += ` Q ${bendX} ${targetY} ${bendX + radius} ${targetY}`
  }

  path += ` L ${targetX} ${targetY}`

  return path
})
</script>
