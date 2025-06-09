<template>
  <BaseEdge
    :id="id"
    :path="edgePath"
    :marker-end="MarkerType.Arrow"
    :style="{ strokeWidth: selected ? 2 : 1 }"
  />
</template>

<script setup lang="ts">
import { BaseEdge, MarkerType, getBezierPath, type EdgeProps } from '@vue-flow/core'

const props = defineProps<EdgeProps>()

const {
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected = false,
} = props

const [edgePath] = getBezierPath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
})
</script>

<style scoped>
/* Add any custom edge styles here */
</style>
