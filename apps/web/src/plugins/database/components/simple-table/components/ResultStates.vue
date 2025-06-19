<template>
  <div v-if="state === 'loading'" class="flex items-center justify-center h-full">
    <div class="text-neutral-500">Loading...</div>
  </div>

  <div v-else-if="state === 'error'" class="flex items-center justify-center h-full p-4">
    <div class="text-center text-red-500">
      <div class="font-semibold">Query Error</div>
      <div class="mt-1 text-sm">{{ error }}</div>
    </div>
  </div>

  <div v-else-if="state === 'no-results'" class="flex items-center justify-center h-full">
    <div class="text-neutral-500">Execute a query to see results</div>
  </div>

  <div v-else-if="state === 'empty-array'" class="flex items-center justify-center h-full">
    <div class="text-neutral-500">Empty array returned</div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  state: 'loading' | 'error' | 'no-results' | 'empty-array';
  error?: string;
}

defineProps<Props>();
</script> 