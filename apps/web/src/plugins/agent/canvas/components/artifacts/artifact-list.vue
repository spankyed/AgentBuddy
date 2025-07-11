<template>
  <div class="w-64 h-full bg-neutral-900 border-r border-neutral-700 overflow-y-auto">
    <div class="p-4">
      <h3 class="text-sm font-semibold text-neutral-300 mb-3">Artifacts</h3>
      <div class="space-y-2">
        <ArtifactItem
          v-for="artifact in artifacts"
          :key="artifact.id"
          :artifact="artifact"
          :isSelected="artifact.id === selectedArtifactId"
          @select="$emit('select-artifact', artifact.id)"
        />
        <div 
          v-if="artifacts.length === 0" 
          class="text-sm text-neutral-500 py-8 text-center"
        >
          No artifacts available
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ArtifactItem from './artifact-item.vue';
import type { ArtifactItem as ArtifactType } from '../../types';

defineProps<{
  artifacts: ArtifactType[];
  selectedArtifactId?: string;
}>();

defineEmits<{
  'select-artifact': [artifactId: string];
}>();
</script>