<template>
  <div class="max-w-4xl mx-auto">
    <div class="p-6 rounded-lg shadow-md bg-neutral-800 animate-fade-in">
      <div class="prose prose-invert max-w-none">
        <p class="text-neutral-300 whitespace-pre-wrap">{{ artifact.content }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ArtifactItem } from '../../../types';

defineProps<{
  artifact: ArtifactItem;
}>();
</script>