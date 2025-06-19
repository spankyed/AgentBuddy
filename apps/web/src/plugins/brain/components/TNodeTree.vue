<template>
  <div class="h-full p-4 overflow-y-auto">
    <div v-if="tnodeTree && tnodeTree.length > 0">
      <TNodeTreeItem
        v-for="node in tnodeTree"
        :key="node.id"
        :tnode="node"
        :depth="0"
        @tnode-click="$emit('tnode-click', $event)"
      />
    </div>
    
    <div v-else class="text-center text-neutral-500">
      No trace data available
    </div>
  </div>
</template>

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