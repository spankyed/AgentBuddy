<template>
  <label :class="['block text-sm font-medium text-neutral-500 mb-3 ml-0', props.class]">
    <slot></slot>
  </label>
</template>

<script setup lang="ts">
const props = defineProps<{
  class?: string
}>()
</script>
