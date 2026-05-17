<template>
  <div class="max-w-4xl">
    <div class="rounded-lg shadow-md bg-neutral-850 animate-fade-in">
      <div class="flex items-center justify-end px-4 pt-3">
        <CopyButton :text="copyText" />
      </div>
      <div class="px-6 pb-6">
        <DataRenderer :data="parsedContent" :default-expanded="true" :hide-expand="true" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ArtifactItem } from '@app/api';
import DataRenderer from '@/plugins/logs/data-renderer.vue';
import CopyButton from '@/core/components/design/CopyButton.vue'

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

const copyText = computed(() =>
  typeof parsedContent.value === 'string'
    ? parsedContent.value
    : JSON.stringify(parsedContent.value, null, 2)
)
</script>
