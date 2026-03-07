<template>
  <div class="max-w-4xl">
    <div class="p-6 rounded-lg shadow-md bg-neutral-800 animate-fade-in">
      <DataRenderer :data="parsedContent" :default-expanded="true" :hide-expand="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ArtifactItem } from '@app/api';
import DataRenderer from '@/plugins/logs/data-renderer.vue';

const props = defineProps<{
  artifact: ArtifactItem;
}>();

const parsedContent = computed(() => {
  if (typeof props.artifact.content === 'string') {
    try {
      return JSON.parse(props.artifact.content);
    } catch {
      return props.artifact.content;
    }
  }
  return props.artifact.content;
});
</script>
