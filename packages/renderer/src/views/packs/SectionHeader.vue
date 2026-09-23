<template>
  <h3 class="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
    {{ label }} ({{ count }})
  </h3>
</template>

<script setup lang="ts">
defineProps<{ label: string; count: number }>();
</script>
