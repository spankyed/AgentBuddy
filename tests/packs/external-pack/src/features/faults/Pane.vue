<script setup lang="ts">
import { computed, ref } from 'vue';
const failed = ref(false);
const message = computed(() => {
  if (failed.value) throw new Error('Fixture pane render failed');
  return 'Fixture pane is healthy';
});
</script>

<template>
  <div class="p-4">
    <p>{{ message }}</p>
    <button class="mt-2 underline" @click="failed = true">Break this pane</button>
  </div>
</template>
