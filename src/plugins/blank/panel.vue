<template>
  <div class="flex items-center justify-between p-4 border-b border-neutral-800">
    <h2 class="text-sm font-medium text-neutral-200">No Context</h2>
  </div>
</template>

<script setup lang="ts">

interface Props {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  items: any[];
}

defineProps<Props>();
</script> 