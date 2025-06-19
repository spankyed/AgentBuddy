<template>
  <div class="h-full overflow-y-auto">
    <div v-if="tnodeTree && tnodeTree.length > 0" class="py-2">
      <TNodeTreeItem
        v-for="node in tnodeTree"
        :key="node.id"
        :tnode="node"
        :depth="0"
        @tnode-click="$emit('tnode-click', $event)"
      />
    </div>
    
    <div v-else class="flex flex-col items-center justify-center h-48 px-4 text-center">
      <div class="flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-neutral-800/50">
        <svg class="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <p class="text-sm text-neutral-400">No trace data available</p>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'TNodeTree'
}
</script>

<script setup lang="ts">
import type { TrackEntity } from '@abuddy/api'
import TNodeTreeItem from './TNodeTreeItem.vue';

interface Props {
  tnodeTree?: TrackEntity[];
}

defineProps<Props>();

defineEmits<{
  'tnode-click': [tNodeId: string];
}>();
</script> 