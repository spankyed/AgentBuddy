<template>
  <div class="overflow-y-auto h-full">
    <div 
      v-for="track in tracks" 
      :key="track.id"
      class="group cursor-pointer hover:bg-neutral-700/30 transition-colors duration-150"
      @click="$emit('track-click', track.id)"
    >
      <div class="px-4 py-3 border-b border-neutral-700/50">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium text-neutral-200">
            {{ track.eventLabel }}
          </span>
          <StatusIndicator :status="track.status" />
        </div>
        <div class="flex items-center gap-2 text-xs text-neutral-400">
          <span>{{ track.id.slice(0, 7) }}</span>
          <span>•</span>
          <span>{{ formatTime(track.startedAt) }}</span>
        </div>
        <!-- Show flow indicator if track has flow node -->
        <div v-if="hasFlowNode(track)" class="mt-2">
          <span class="inline-flex items-center gap-1 text-xs text-blue-400">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            Has sub-flow
          </span>
        </div>
      </div>
    </div>
    
    <div v-if="tracks.length === 0" class="p-4 text-center text-neutral-500">
      No active tracks
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TrackEntity } from '@abuddy/api/systems/brain/types';
import StatusIndicator from './StatusIndicator.vue';

interface Props {
  tracks: TrackEntity[];
}

defineProps<Props>();

defineEmits<{
  'track-click': [trackId: string];
}>();

const formatTime = (timestamp: number) => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

const hasFlowNode = (track: TrackEntity) => {
  // Check if track contains Node-11 (flow node from mock data)
  return track.nodes.includes('Node-11' as any);
};
</script> 