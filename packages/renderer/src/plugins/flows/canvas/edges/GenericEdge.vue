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

  // Calculate vertical distance from source to target
  const verticalDist = Math.abs(targetY - sourceY)

  // Invert the logic: edges going to CLOSER nodes bend FURTHER out
  // This creates a cleaner fan pattern where outer edges are straighter
  const distanceFactor = Math.min(verticalDist / edge.distanceNormalization, 1)
  const bendX = sourceX + edge.maxBendOffset - (distanceFactor * (edge.maxBendOffset - edge.minBendOffset))

  // Radius for rounded corners
  const radius = edge.cornerRadius

  // Determine direction
  const goingDown = targetY > sourceY
  const straight = Math.abs(targetY - sourceY) < edge.straightThreshold

  if (straight) {
    // Straight horizontal line
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  }

  // Create smooth step path with rounded corners
  // Path: source -> horizontal to bendX -> vertical to targetY -> horizontal to target
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
