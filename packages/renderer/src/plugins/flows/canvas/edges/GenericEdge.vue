<template>
  <SmoothStepEdge
    v-bind="{
      ...props,
      markerEnd: MarkerType.Arrow,
      style: { strokeWidth: selected ? 2 : 1 }
    }"
  />
</template>

<script setup lang="ts">
import { SmoothStepEdge, MarkerType, type EdgeProps } from '@vue-flow/core'

const props = defineProps<EdgeProps>()
const { selected = false } = props
</script>

<style scoped>
/* Add any custom edge styles here */
</style>
