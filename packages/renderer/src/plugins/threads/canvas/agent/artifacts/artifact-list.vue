<template>
  <div class="p-2">
    <!-- <h3 class="mb-3 text-sm font-semibold text-neutral-300">Artifacts</h3> -->
    <div class="space-y-1">
      <ArtifactItem
        v-for="artifact in sortedArtifacts"
        :key="artifact.id"
        :artifact="artifact"
        :isSelected="artifact.id === selectedArtifactId"
        @select="$emit('select-artifact', artifact.id)"
      />
      <div
        v-if="artifacts.length === 0"
        class="py-8 text-sm text-center text-neutral-500"
      >
        No artifacts available
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ArtifactItem from './artifact-item.vue';
import type { ArtifactItem as ArtifactType } from '@app/api';

const props = defineProps<{
  artifacts: ArtifactType[];
  selectedArtifactId?: string;
}>();

defineEmits<{
  'select-artifact': [artifactId: string];
}>();

// Sort all artifacts by most recently created first.
const sortedArtifacts = computed(() => {
  return [...props.artifacts].sort((a, b) =>
    (b.metadata?.createdAt ?? 0) - (a.metadata?.createdAt ?? 0)
  );
});
</script>