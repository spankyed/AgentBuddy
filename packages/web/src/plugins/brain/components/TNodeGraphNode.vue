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
          {{ data.tNodeType === 'event' ? formatNodeType(data.tNodeType) : ''}}
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
    <div v-if="data.tNodeType === 'flow'" class="absolute bottom-1 right-1">
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
import { getNodeClasses, getNodeGlowClasses, getNodeBadgeClasses, getNodeIconDotClasses, getNodeStatusClasses } from '../../flows/config/node-config';

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
  const nodeType = props.data.stepNodeType || props.data.tNodeType;
  return getNodeClasses(nodeType, { isEvent: props.data.tNodeType === 'event' });
});

const iconClasses = computed(() => {
  const nodeType = props.data.stepNodeType || props.data.tNodeType;
  return getNodeIconDotClasses(nodeType, { 
    isEvent: props.data.tNodeType === 'event',
    includeRing: true 
  });
});

const glowClasses = computed(() => {
  const nodeType = props.data.stepNodeType || props.data.tNodeType;
  return getNodeGlowClasses(nodeType, { isEvent: props.data.tNodeType === 'event' });
});

const badgeClasses = computed(() => {
  const nodeType = props.data.stepNodeType || props.data.tNodeType;
  return getNodeBadgeClasses(nodeType, { isEvent: props.data.tNodeType === 'event' });
});

const statusClasses = computed(() => {
  if (!props.data.status) return { outer: '', inner: '' };
  return getNodeStatusClasses(props.data.status, 'detailed') as { outer: string; inner: string };
});

const statusOuterClasses = computed(() => statusClasses.value.outer);
const statusInnerClasses = computed(() => statusClasses.value.inner);

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