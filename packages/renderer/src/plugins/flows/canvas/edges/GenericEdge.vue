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

  // For converging edges, spread them vertically before the target
  // Only apply when there's enough horizontal space to avoid wrapping
  const siblings = getEdges.value.filter(e => e.target === target)
  const hasEnoughSpace = targetX - sourceX > edge.anchorOffset * 2
  let anchorY = targetY

  if (siblings.length >= 2 && hasEnoughSpace) {
    const idx = siblings.findIndex(e => e.id === id)
    const spread = (siblings.length - 1) * edge.spreadSpacing
    anchorY = targetY - spread / 2 + idx * edge.spreadSpacing
  }

  return buildPath(sourceX, sourceY, targetX, anchorY, targetY, edge)
})

function buildPath(
  sourceX: number, sourceY: number,
  targetX: number, anchorY: number, targetY: number,
  cfg: typeof LAYOUT_CONFIG.edge
): string {
  const vDistToAnchor = Math.abs(anchorY - sourceY)
  const vDistToTarget = Math.abs(targetY - anchorY)

  // Straight line if minimal vertical distance
  if (vDistToAnchor < cfg.straightThreshold && vDistToTarget < cfg.straightThreshold) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  }

  const radius = cfg.cornerRadius
  const factor = Math.min(vDistToAnchor / cfg.distanceNormalization, 1)
  const bendX = Math.min(
    sourceX + cfg.maxBendOffset - factor * (cfg.maxBendOffset - cfg.minBendOffset),
    targetX - cfg.anchorOffset
  )
  const bendRadius = Math.min(radius, vDistToAnchor / 2.5, Math.max(4, (targetX - sourceX) / 4))
  const bendDir = anchorY > sourceY ? 1 : -1

  let path = `M ${sourceX} ${sourceY}`
  path += ` L ${bendX - bendRadius} ${sourceY}`
  path += ` Q ${bendX} ${sourceY} ${bendX} ${sourceY + bendDir * bendRadius}`
  path += ` L ${bendX} ${anchorY - bendDir * bendRadius}`
  path += ` Q ${bendX} ${anchorY} ${bendX + bendRadius} ${anchorY}`

  if (vDistToTarget < cfg.straightThreshold) {
    path += ` L ${targetX} ${targetY}`
  } else {
    const anchorRadius = Math.min(radius, vDistToTarget / 2.5)
    const anchorDir = targetY > anchorY ? 1 : -1
    const anchorX = targetX - cfg.anchorOffset
    path += ` L ${anchorX - anchorRadius} ${anchorY}`
    path += ` Q ${anchorX} ${anchorY} ${anchorX} ${anchorY + anchorDir * anchorRadius}`
    path += ` L ${anchorX} ${targetY - anchorDir * anchorRadius}`
    path += ` Q ${anchorX} ${targetY} ${anchorX + anchorRadius} ${targetY}`
    path += ` L ${targetX} ${targetY}`
  }

  return path
}
</script>
