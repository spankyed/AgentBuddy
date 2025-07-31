<template>
  <svg
    :width="size || 24"
    :height="size || 24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="lucide lucide-stop"
  >
    <rect x="6" y="6" width="12" height="12" rx="2" :fill="'currentColor'" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{
  size?: number
}>()
</script>

<script lang="ts">
export default {
  name: 'SoftStopIcon'
}
</script> 