<template>
  <div class="p-4">
    <!-- <h3 class="mb-3 text-sm font-semibold text-neutral-300">Artifacts</h3> -->
    <div class="space-y-2">
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

// Pin `claude-session` and `bg-processes` artifacts to the top of the list
// so users always see session info and running processes above everything else.
// Ordering within buckets preserves the original array order (stable sort).
const pinnedTypes = new Set(['claude-session', 'bg-processes']);
const sortedArtifacts = computed(() => {
  const pinned = props.artifacts.filter(a => pinnedTypes.has(a.type));
  const rest = props.artifacts.filter(a => !pinnedTypes.has(a.type));
  return [...pinned, ...rest];
});
</script>