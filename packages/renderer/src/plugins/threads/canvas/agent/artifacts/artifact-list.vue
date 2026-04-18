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

// Pin `claude-session` artifacts to the top of the list so users always see
// the session header above whatever else the thread has accumulated. Within
// each bucket, sort by most recently created first.
const sortedArtifacts = computed(() => {
  const byCreated = (a: ArtifactType, b: ArtifactType) =>
    (b.metadata?.createdAt ?? 0) - (a.metadata?.createdAt ?? 0);
  const pinned = props.artifacts.filter(a => a.type === 'claude-session').sort(byCreated);
  const rest = props.artifacts.filter(a => a.type !== 'claude-session').sort(byCreated);
  return [...pinned, ...rest];
});
</script>