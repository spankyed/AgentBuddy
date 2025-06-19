<template>
  <div 
    class="tnode-graph-node"
    :class="[
      nodeClasses,
      {
        'ring-2 ring-blue-500': data.status === 'active',
        'cursor-pointer hover:ring-2 hover:ring-purple-500': data.hasChildren,
      }
    ]"
  >
    <div class="flex items-center gap-2">
      <div 
        class="w-3 h-3 rounded-full"
        :class="iconClasses"
      />
      <span class="text-xs font-medium">{{ data.label }}</span>
    </div>
    
    <!-- Show node type badge -->
    <div class="mt-1">
      <span class="text-[10px] text-neutral-400 capitalize">
        {{ data.nodeType }}
        <span v-if="data.stepNodeType">({{ data.stepNodeType }})</span>
      </span>
    </div>
    
    <!-- Has children indicator -->
    <div v-if="data.hasChildren" class="absolute -top-2 -right-2">
      <div class="w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center">
        <svg class="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </div>
    </div>
    
    <!-- Status indicator -->
    <div class="absolute -top-2 -left-2">
      <StatusIndicator :status="data.status" />
    </div>
    
    <Handle
      type="target"
      :position="Position.Left"
      :style="{ background: '#555' }"
    />
    <Handle
      type="source"
      :position="Position.Right"
      :style="{ background: '#555' }"
    />
  </div>
</template>

<script lang="ts">
export default {
  name: 'TNodeGraphNode'
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import StatusIndicator from './StatusIndicator.vue';

interface Props {
  data: {
    label: string;
    nodeType: 'flow' | 'event' | 'step';
    stepNodeType?: string;
    status: 'active' | 'paused' | 'completed' | 'failed';
    hasChildren: boolean;
  };
}

const props = defineProps<Props>();

const nodeClasses = computed(() => {
  const base = 'px-4 py-2 rounded-md border relative transition-all';
  
  switch (props.data.nodeType) {
    case 'flow':
      return `${base} bg-purple-500/20 border-purple-500/50 text-purple-200`;
    case 'event':
      return `${base} bg-blue-500/20 border-blue-500/50 text-blue-200`;
    case 'step':
      // Color based on step type
      switch (props.data.stepNodeType) {
        case 'listen':
          return `${base} bg-blue-500/20 border-blue-500/50 text-blue-200`;
        case 'query':
          return `${base} bg-cyan-500/20 border-cyan-500/50 text-cyan-200`;
        case 'create':
        case 'update':
          return `${base} bg-purple-500/20 border-purple-500/50 text-purple-200`;
        case 'fire':
          return `${base} bg-red-500/20 border-red-500/50 text-red-200`;
        case 'decision':
          return `${base} bg-orange-500/20 border-orange-500/50 text-orange-200`;
        case 'transform':
          return `${base} bg-green-500/20 border-green-500/50 text-green-200`;
        case 'flow':
          return `${base} bg-purple-500/20 border-purple-500/50 text-purple-200`;
        default:
          return `${base} bg-neutral-700 border-neutral-600 text-neutral-300`;
      }
    default:
      return `${base} bg-neutral-700 border-neutral-600 text-neutral-300`;
  }
});

const iconClasses = computed(() => {
  switch (props.data.nodeType) {
    case 'flow':
      return 'bg-purple-500';
    case 'event':
      return 'bg-blue-500';
    case 'step':
      switch (props.data.stepNodeType) {
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

<style scoped>
.tnode-graph-node {
  min-width: 150px;
}
</style> 