<template>
  <div class="flex-1 h-full p-6 overflow-auto bg-neutral-850">
    <div v-if="!artifact" class="flex items-center justify-center h-full">
      <p class="text-neutral-500">Select an artifact to view</p>
    </div>
    <component
      v-else
      :is="getArtifactComponent(artifact.type)"
      :artifact="artifact"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ArtifactItem } from '@abuddy/api';
import TextArtifact from './artifacts/types/text-artifact.vue';
import CodeArtifact from './artifacts/types/code-artifact.vue';
import ReviewArtifact from './artifacts/types/review-artifact.vue';
import ImageArtifact from './artifacts/types/image-artifact.vue';
import WorkloadArtifact from './artifacts/types/workload-artifact.vue';
import SlackArtifact from './artifacts/types/slack-artifact.vue';

const props = defineProps<{
  artifact?: ArtifactItem;
}>();

function getArtifactComponent(type: string) {
  const components = {
    text: TextArtifact,
    code: CodeArtifact,
    review: ReviewArtifact,
    image: ImageArtifact,
    kanban: WorkloadArtifact,
    slack: SlackArtifact,
  };
  return components[type as keyof typeof components] || TextArtifact;
}
</script>