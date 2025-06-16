<template>
  <div class="p-4">
    <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-md">
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