<template>
  <div>
    <div
      class="flex items-center gap-2 px-2 py-1 transition-colors rounded cursor-pointer hover:bg-neutral-700/30"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="$emit('tnode-click', tnode.id)"
    >
      <!-- Expand/Collapse Icon -->
      <div class="flex items-center justify-center w-4 h-4">
        <svg
          v-if="tnode.children.length > 0"
          class="w-3 h-3 transition-transform"
          :class="{ 'rotate-90': expanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          @click.stop="expanded = !expanded"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      
      <!-- Node Type Icon -->
      <div
        class="w-0.5 h-4 rounded-sm transition-all duration-200 group-hover:h-5"
        :class="nodeTypeColor"
      />
      
      <!-- Label -->
      <span class="text-sm text-neutral-200">{{ tnode.label }}</span>
      
      <!-- Status -->
      <StatusIndicator :status="tnode.status" />
    </div>
    
    <!-- Children -->
    <div v-if="expanded && tnode.children.length > 0">
      <TNodeTreeItem
        v-for="child in tnode.children"
        :key="child.id"
        :tnode="child"
        :depth="depth + 1"
        @tnode-click="$emit('tnode-click', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { TrackEntity } from '@abuddy/api'
import StatusIndicator from './StatusIndicator.vue';

interface Props {
  tnode: TrackEntity;
  depth: number;
}

const props = defineProps<Props>();

defineEmits<{
  'tnode-click': [tNodeId: string];
}>();

const expanded = ref(true);

const nodeTypeColor = computed(() => {
  switch (props.tnode.nodeType) {
    case 'flow':
      return 'bg-purple-500';
    case 'event':
      return 'bg-blue-500';
    case 'step':
      switch (props.tnode.stepNodeType) {
        case 'listen':
          return 'bg-blue-500';
        case 'query':
          return 'bg-cyan-500';
        case 'create':
        case 'update':
          return 'bg-purple-500';
        case 'fire':
          return 'bg-red-500';
        case 'decision':
          return 'bg-orange-500';
        case 'transform':
          return 'bg-green-500';
        case 'flow':
          return 'bg-purple-500';
        default:
          return 'bg-neutral-500';
      }
    default:
      return 'bg-neutral-500';
  }
});
</script> 