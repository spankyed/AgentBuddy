<template>
  <div 
    class="tnode-graph-node group"
    :class="[
      nodeClasses,
      {
        'ring-2 ring-offset-2 ring-offset-neutral-900': data.status === 'active',
        'cursor-pointer': data.hasChildren,
      }
    ]"
  >
    <!-- Glow effect on hover -->
    <div 
      class="absolute inset-0 transition-opacity duration-300 rounded-md opacity-0 group-hover:opacity-100 blur-xl"
      :class="glowClasses"
    />
    
    <!-- Main content -->
    <div class="relative z-10">
      <!-- Header -->
      <div class="flex items-center gap-2">
        <div 
          class="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-offset-1 ring-offset-neutral-900/50"
          :class="iconClasses"
        />
        <span class="text-xs font-medium tracking-tight text-white/90">{{ data.label }}</span>
      </div>
      
      <!-- Node type badge at bottom -->
      <div class="mt-1.5 flex items-center gap-1.5">
        <span 
          class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase"
          :class="badgeClasses"
        >
          {{ formatNodeType(data.tNodeType) }}
          <span v-if="data.stepNodeType" class="ml-1">{{ formatNodeType(data.stepNodeType) }}</span>
        </span>
      </div>
    </div>
    
    <!-- Status indicator - refined design -->
    <div v-if="data.status" class="absolute -top-2 -right-2">
      <div class="relative flex items-center justify-center">
        <!-- Outer ring for active state -->
        <div 
          v-if="data.status === 'active'"
          class="absolute w-5 h-5 rounded-full ring-2 ring-emerald-400/30 animate-ping"
        />
        <!-- Main status dot with inner gradient -->
        <div 
          class="relative w-3 h-3 overflow-hidden rounded-full"
          :class="statusOuterClasses"
        >
          <div 
            class="absolute inset-0"
            :class="statusInnerClasses"
          />
          <!-- Highlight effect -->
          <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-white/30 to-transparent" />
        </div>
      </div>
    </div>
    
    <!-- Has children indicator - minimalist design -->
    <div v-if="data.hasChildren" class="absolute bottom-1 right-1">
      <div class="relative">
        <!-- Simple dot indicator with subtle animation -->
        <div class="relative flex items-center justify-center w-5 h-5">
          <div class="absolute inset-0 transition-transform duration-200 scale-75 rounded-full bg-purple-500/20 group-hover:scale-100" />
          <svg class="relative w-2.5 h-2.5 text-purple-400/80" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
          </svg>
        </div>
      </div>
    </div>
    
    <!-- Connection handles with better styling -->
    <Handle
      type="target"
      :position="Position.Left"
      class="!w-2 !h-2 !bg-neutral-700 !border-2 !border-neutral-600 hover:!bg-neutral-600 transition-colors"
    />
    <Handle
      type="source"
      :position="Position.Right"
      class="!w-2 !h-2 !bg-neutral-700 !border-2 !border-neutral-600 hover:!bg-neutral-600 transition-colors"
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
import type { NodeKind } from '@abuddy/api';

interface Props {
  data: {
    label: string;
    tNodeType: 'flow' | 'event' | 'step';
    stepNodeType?: string;
    status: 'active' | 'paused' | 'completed' | 'failed';
    hasChildren: boolean;
  };
}

const props = defineProps<Props>();

const nodeClasses = computed(() => {
  const baseClasses = 'px-3 py-2 rounded-md border backdrop-blur-sm transition-all duration-200';
  
  if (props.data.tNodeType === 'event') {
    return `${baseClasses} bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/20 ring-blue-400`;
  }
  
  const nodeType = props.data.stepNodeType || props.data.tNodeType;
  
  switch (nodeType) {
    case 'flow':
      return `${baseClasses} bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20 ring-purple-400`;
    case 'listen':
      return `${baseClasses} bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/20 ring-blue-400`;
    case 'fire':
      return `${baseClasses} bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-500/20 ring-amber-400`;
    case 'query':
      return `${baseClasses} bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/20 ring-cyan-400`;
    case 'create':
    case 'update':
      return `${baseClasses} bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20 ring-purple-400`;
    case 'decision':
      return `${baseClasses} bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-orange-500/30 hover:border-orange-400/50 hover:shadow-lg hover:shadow-orange-500/20 ring-orange-400`;
    case 'transform':
      return `${baseClasses} bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/20 ring-emerald-400`;
    case 'llm':
      return `${baseClasses} bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 hover:border-indigo-400/50 hover:shadow-lg hover:shadow-indigo-500/20 ring-indigo-400`;
    default:
      return `${baseClasses} bg-gradient-to-br from-neutral-700/50 to-neutral-800/30 border-neutral-600 hover:border-neutral-500 hover:shadow-lg hover:shadow-neutral-500/20 ring-neutral-400`;
  }
});

const iconClasses = computed(() => {
  if (props.data.tNodeType === 'event') {
    return 'bg-blue-500 ring-blue-500/30';
  }
  
  const nodeType = props.data.stepNodeType || props.data.tNodeType;
  const colorMap: Record<string, string> = {
    flow: 'bg-purple-500 ring-purple-500/30',
    listen: 'bg-blue-500 ring-blue-500/30',
    fire: 'bg-amber-500 ring-amber-500/30',
    query: 'bg-cyan-500 ring-cyan-500/30',
    create: 'bg-purple-500 ring-purple-500/30',
    update: 'bg-purple-500 ring-purple-500/30',
    decision: 'bg-orange-500 ring-orange-500/30',
    transform: 'bg-emerald-500 ring-emerald-500/30',
    llm: 'bg-indigo-500 ring-indigo-500/30',
  };
  
  return colorMap[nodeType] || 'bg-neutral-500 ring-neutral-500/30';
});

const glowClasses = computed(() => {
  if (props.data.tNodeType === 'event') {
    return 'bg-blue-500/20';
  }
  
  const nodeType = props.data.stepNodeType || props.data.tNodeType;
  const glowMap: Record<string, string> = {
    flow: 'bg-purple-500/20',
    listen: 'bg-blue-500/20',
    fire: 'bg-amber-500/20',
    query: 'bg-cyan-500/20',
    create: 'bg-purple-500/20',
    update: 'bg-purple-500/20',
    decision: 'bg-orange-500/20',
    transform: 'bg-emerald-500/20',
    llm: 'bg-indigo-500/20',
  };
  
  return glowMap[nodeType] || 'bg-neutral-500/20';
});

const badgeClasses = computed(() => {
  if (props.data.tNodeType === 'event') {
    return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
  }
  
  const nodeType = props.data.stepNodeType || props.data.tNodeType;
  const badgeMap: Record<string, string> = {
    flow: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    listen: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    fire: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    query: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
    create: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    update: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    decision: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    transform: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    llm: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
  };
  
  return badgeMap[nodeType] || 'bg-neutral-700/50 text-neutral-300 border border-neutral-600';
});

const statusOuterClasses = computed(() => {
  if (!props.data.status) return '';
  
  switch (props.data.status) {
    case 'active':
      return 'ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-500/30';
    case 'paused':
      return 'ring-1 ring-amber-500/50 shadow-lg shadow-amber-500/30';
    case 'completed':
      return 'ring-1 ring-blue-500/50 shadow-lg shadow-blue-500/30';
    case 'failed':
      return 'ring-1 ring-red-500/50 shadow-lg shadow-red-500/30';
    default:
      return 'ring-1 ring-neutral-500/50';
  }
});

const statusInnerClasses = computed(() => {
  if (!props.data.status) return '';
  
  switch (props.data.status) {
    case 'active':
      return 'bg-gradient-to-br from-emerald-400 to-emerald-600';
    case 'paused':
      return 'bg-gradient-to-br from-amber-400 to-amber-600';
    case 'completed':
      return 'bg-gradient-to-br from-blue-400 to-blue-600';
    case 'failed':
      return 'bg-gradient-to-br from-red-400 to-red-600';
    default:
      return 'bg-gradient-to-br from-neutral-400 to-neutral-600';
  }
});

const formatNodeType = (type: string) => {
  return type.replace(/_/g, ' ');
};
</script>

<style scoped>
.tnode-graph-node {
  min-width: 150px;
  max-width: 240px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
}

.tnode-graph-node:hover {
  transform: translateY(-0.5px);
}

/* Vue Flow handle overrides for better visibility */
:deep(.vue-flow__handle) {
  transition: all 0.2s ease;
}

/* Smooth transitions for all interactive elements */
.tnode-graph-node * {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}
</style> 