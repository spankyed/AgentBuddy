<template>
  <div class="p-4">
    <div class="p-4 rounded-md bg-neutral-100 dark:bg-neutral-900">
      {{ value }}
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  value: any;
}

defineProps<Props>();
</script> 