<template>
  <div class="max-w-4xl">
    <div class="rounded-lg shadow-md bg-neutral-850 animate-fade-in">
      <div class="flex items-center justify-end px-4 pt-3">
        <CopyButton :text="typeof artifact.content === 'string' ? artifact.content : ''" />
      </div>
      <div class="px-6 pb-6 prose prose-invert max-w-none">
        <p class="text-neutral-300 whitespace-pre-wrap">{{ artifact.content }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ArtifactItem } from '@app/api';
import CopyButton from '@/core/components/design/CopyButton.vue'

defineProps<{
  artifact: ArtifactItem;
}>();
</script>
