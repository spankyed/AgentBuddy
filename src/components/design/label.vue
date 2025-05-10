<template>
  <label :class="['block text-sm font-medium text-neutral-500 mb-2 ml-1', props.class]">
    <slot></slot>
  </label>
</template>

<script setup lang="ts">
const props = defineProps<{
  class?: string
}>()
</script>
