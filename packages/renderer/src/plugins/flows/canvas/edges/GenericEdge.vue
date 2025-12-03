<template>
  <path
    :d="edgePath"
    :style="{
      strokeWidth: selected ? 2 : 1.5,
      stroke: '#888',
      fill: 'none'
    }"
    :marker-end="markerEnd"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MarkerType, type EdgeProps } from '@vue-flow/core'
import { LAYOUT_CONFIG } from '@/plugins/flows/canvas/layout-utils'

const props = defineProps<EdgeProps>()
const { selected = false } = props

// Custom marker end
const markerEnd = `url(#${MarkerType.Arrow})`

// Generate edge path with consistent spacing based on vertical distance
const edgePath = computed(() => {
  const { sourceX, sourceY, targetX, targetY } = props
  const { edge } = LAYOUT_CONFIG

  // Calculate distances
  const verticalDist = Math.abs(targetY - sourceY)
  const horizontalDist = targetX - sourceX

  // Determine if edge is essentially straight
  const straight = verticalDist < edge.straightThreshold

  if (straight) {
    // Straight horizontal line
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  }

  // Calculate bend position
  const distanceFactor = Math.min(verticalDist / edge.distanceNormalization, 1)
  const rawBendX = sourceX + edge.maxBendOffset - (distanceFactor * (edge.maxBendOffset - edge.minBendOffset))

  // Dynamically adjust radius based on available space
  // Need room for: first curve + vertical line + second curve (vertically)
  // And: horizontal line to bend + bend + horizontal line to target (horizontally)
  const maxVerticalRadius = verticalDist / 2.5
  const maxHorizontalRadius = Math.min(rawBendX - sourceX, horizontalDist - (rawBendX - sourceX)) / 2
  const radius = Math.min(edge.cornerRadius, maxVerticalRadius, Math.max(4, maxHorizontalRadius))

  // Cap bendX to leave room for final horizontal segment
  const bendX = Math.min(rawBendX, targetX - radius - 5)

  // Determine direction
  const goingDown = targetY > sourceY
  const midY = targetY

  if (goingDown) {
    return `
      M ${sourceX} ${sourceY}
      L ${bendX - radius} ${sourceY}
      Q ${bendX} ${sourceY} ${bendX} ${sourceY + radius}
      L ${bendX} ${midY - radius}
      Q ${bendX} ${midY} ${bendX + radius} ${midY}
      L ${targetX} ${targetY}
    `.trim()
  } else {
    return `
      M ${sourceX} ${sourceY}
      L ${bendX - radius} ${sourceY}
      Q ${bendX} ${sourceY} ${bendX} ${sourceY - radius}
      L ${bendX} ${midY + radius}
      Q ${bendX} ${midY} ${bendX + radius} ${midY}
      L ${targetX} ${targetY}
    `.trim()
  }
})
</script>

<style scoped>
/* Add any custom edge styles here */
</style>
