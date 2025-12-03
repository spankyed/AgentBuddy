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

  // Find sibling edges - sort by ID for consistent ordering across page refreshes
  const siblings = getEdges.value
    .filter(e => e.target === target)
    .sort((a, b) => a.id.localeCompare(b.id))
  const hasSiblings = siblings.length >= 2

  // Anchor X position - just before the target
  const anchorX = targetX - 25

  // Calculate spread Y for this edge at the anchor point
  let anchorY = targetY
  if (hasSiblings) {
    const idx = siblings.findIndex(e => e.id === id)
    const totalSpread = (siblings.length - 1) * edge.anchorSpread
    anchorY = targetY - totalSpread / 2 + idx * edge.anchorSpread
  }

  const vDist = Math.abs(anchorY - sourceY)

  // Straight line if no vertical distance and no siblings
  if (vDist < edge.straightThreshold && !hasSiblings) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  }

  // Calculate first bend point
  const factor = Math.min(vDist / edge.distanceNormalization, 1)
  const bendX = Math.min(
    sourceX + edge.maxBendOffset - factor * (edge.maxBendOffset - edge.minBendOffset),
    (sourceX + anchorX) / 2
  )

  const radius = Math.min(edge.cornerRadius, Math.max(vDist / 2.5, 2), Math.max(4, (anchorX - sourceX) / 4))
  const dir = anchorY > sourceY ? 1 : -1

  let path = `M ${sourceX} ${sourceY}`

  // First segment: source to anchor Y
  if (vDist >= edge.straightThreshold) {
    path += ` L ${bendX - radius} ${sourceY}`
    path += ` Q ${bendX} ${sourceY} ${bendX} ${sourceY + dir * radius}`
    path += ` L ${bendX} ${anchorY - dir * radius}`
    path += ` Q ${bendX} ${anchorY} ${bendX + radius} ${anchorY}`
  }

  // Second segment: anchor point to target (converge back to handle)
  if (hasSiblings && Math.abs(targetY - anchorY) >= edge.straightThreshold) {
    const anchorDir = targetY > anchorY ? 1 : -1
    const anchorRadius = Math.min(edge.cornerRadius, Math.abs(targetY - anchorY) / 2.5)
    path += ` L ${anchorX - anchorRadius} ${anchorY}`
    path += ` Q ${anchorX} ${anchorY} ${anchorX} ${anchorY + anchorDir * anchorRadius}`
    path += ` L ${anchorX} ${targetY - anchorDir * anchorRadius}`
    path += ` Q ${anchorX} ${targetY} ${anchorX + anchorRadius} ${targetY}`
    path += ` L ${targetX} ${targetY}`
  } else {
    path += ` L ${targetX} ${targetY}`
  }

  return path
})
</script>
