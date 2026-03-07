<template>
  <div class="max-w-4xl">
    <div class="p-6 rounded-lg shadow-md bg-neutral-850 animate-fade-in">
      <div class="prose prose-invert max-w-none">
        <p class="text-neutral-300 whitespace-pre-wrap">{{ artifact.content }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ArtifactItem } from '@app/api';

defineProps<{
  artifact: ArtifactItem;
}>();
</script>