<template>
  <div class="max-w-4xl">
    <div class="p-6 rounded-lg shadow-md bg-neutral-850 animate-fade-in">
      <img 
        :src="artifact.content" 
        :alt="artifact.title" 
        class="h-auto max-w-full rounded-lg"
      />
      <p v-if="artifact.metadata?.caption" class="mt-4 text-sm text-neutral-400 text-center">
        {{ artifact.metadata.caption }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ArtifactItem } from '@app/api';

defineProps<{
  artifact: ArtifactItem;
}>();
</script>