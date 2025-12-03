<template>
  <path
    :d="edgePath"
    :style="{ strokeWidth: selected ? 2 : 1.5, stroke: '#888', fill: 'none' }"
    :marker-end="`url(#${MarkerType.Arrow})`"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MarkerType, type EdgeProps } from '@vue-flow/core'
import { LAYOUT_CONFIG } from '@/plugins/flows/canvas/layout-utils'

const props = defineProps<EdgeProps>()
const { selected = false } = props

const edgePath = computed(() => {
  const { sourceX, sourceY, targetX, targetY } = props
  const { edge } = LAYOUT_CONFIG
  const vDist = Math.abs(targetY - sourceY)

  if (vDist < edge.straightThreshold) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  }

  const factor = Math.min(vDist / edge.distanceNormalization, 1)
  const rawBendX = sourceX + edge.maxBendOffset - factor * (edge.maxBendOffset - edge.minBendOffset)
  const r = Math.min(edge.cornerRadius, vDist / 2.5, Math.max(4, (targetX - sourceX) / 4))
  const bendX = Math.min(rawBendX, targetX - r - 5)
  const dir = targetY > sourceY ? 1 : -1

  return `M ${sourceX} ${sourceY} L ${bendX - r} ${sourceY} Q ${bendX} ${sourceY} ${bendX} ${sourceY + dir * r} L ${bendX} ${targetY - dir * r} Q ${bendX} ${targetY} ${bendX + r} ${targetY} L ${targetX} ${targetY}`
})
</script>
