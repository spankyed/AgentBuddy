<template>
  <div 
    class="tnode-item"
    :class="{ 'has-children': tnode.children.length > 0 }"
  >
    <div
      class="relative w-full overflow-hidden tnode-container group"
      :class="[itemClasses, tnode.children.length > 0 && expanded ? 'expanded' : '']"
    >
      <!-- Clickable header area -->
      <button
        class="relative w-full tnode-header"
        @click="handleClick"
      >
        <!-- Glow effect on hover -->
        <div 
          class="absolute inset-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100 blur-xl"
          :class="glowClasses"
        />
        
        <!-- Main content -->
        <div class="relative z-10 flex items-center gap-2 px-3 py-2.5">
          <!-- Expand/Collapse icon for nodes with children -->
          <ChevronRight 
            v-if="tnode.children.length > 0" 
            :class="['w-3.5 h-3.5 text-neutral-500 transition-all flex-shrink-0', 
                     { 'rotate-90': expanded, 'text-neutral-300': expanded }]"
          />
          
          <!-- Icon dot with enhanced styling -->
          <div 
            class="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-offset-1 ring-offset-neutral-900/50 transition-all duration-200"
            :class="iconDotClasses"
          />
          
          <!-- Node label with context -->
          <div class="flex-1 min-w-0 text-left relative pr-16">
            <span class="text-xs font-medium tracking-tight truncate transition-colors duration-200 text-white/90 group-hover:text-white block">
              {{ tnode.label }}
            </span>
            <!-- Timestamp positioned absolutely -->
            <span v-if="tnode.startedAt" class="text-[10px] text-neutral-500 absolute right-0 top-1/2 -translate-y-1/2">
              {{ formatTimestamp(tnode.startedAt) }}
            </span>
          </div>
          
          <!-- Node type icon -->
          <component
            :is="nodeIcon"
            class="w-3.5 h-3.5 transition-all duration-200"
            :class="iconComponentClasses"
          />
          
          <!-- Status indicator with better sizing -->
          <div 
            v-if="tnode.status"
            class="relative flex items-center ml-1"
          >
            <div
              :class="[
                'rounded-full transition-all',
                depth === 0 ? 'w-1.5 h-1.5 ring-2 ring-offset-2 ring-offset-neutral-900' : 'w-1 h-1 ring-1 ring-offset-1 ring-offset-neutral-900',
                statusClasses, 
                statusRingClasses
              ]"
            />
          </div>
        </div>
        
        <!-- Subtle gradient overlay -->
        <div 
          class="absolute inset-0 transition-opacity duration-200 opacity-0 pointer-events-none bg-gradient-to-r group-hover:opacity-10"
          :class="gradientClasses"
        />
      </button>
      
      <!-- Children nested inside parent container -->
      <div v-if="expanded && tnode.children.length > 0" class="tnode-children">
        <TNodeTreeItem
          v-for="child in tnode.children"
          :key="child.id"
          :tnode="child"
          :depth="depth + 1"
          @tnode-click="$emit('tnode-click', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import type { TrackEntity } from '@abuddy/api';
import { 
  getPaletteItemClasses,
  getPaletteIconClasses,
  getPaletteIconComponentClasses,
  getPaletteGlowClasses,
  getPaletteGradientClasses,
  getNodeStatusClasses,
  getNodeConfig,
  nodeConfigs
} from '@/plugins/flows/config/node-config';
import type { NodeKind } from '@abuddy/api';

interface Props {
  tnode: TrackEntity;
  depth: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'tnode-click': [tNodeId: string];
}>();

const expanded = ref(false);

// Map TNode type to actual node type for styling
const effectiveNodeType = computed((): string => {
  if (!props.tnode) return 'neutral';
  
  // For step nodes, use the actual node type
  if (props.tnode.tNodeType === 'step' && props.tnode.stepNodeType) {
    return props.tnode.stepNodeType;
  }
  
  // Map other TNode types
  switch (props.tnode.tNodeType) {
    case 'flow': return 'flow';
    case 'event': return 'listen'; // Events map to listen nodes
    default: return 'action'; // Default fallback
  }
});

// Get node icon from config
const nodeIcon = computed(() => {
  const config = getNodeConfig(effectiveNodeType.value as NodeKind);
  return config?.icon || nodeConfigs.action?.icon;
});

// Styling classes from node-config
const itemClasses = computed(() => getPaletteItemClasses(effectiveNodeType.value));
const glowClasses = computed(() => getPaletteGlowClasses(effectiveNodeType.value));
const iconDotClasses = computed(() => getPaletteIconClasses(effectiveNodeType.value));
const iconComponentClasses = computed(() => getPaletteIconComponentClasses(effectiveNodeType.value));
const gradientClasses = computed(() => getPaletteGradientClasses(effectiveNodeType.value));

// Status styling with proper animation
const statusClasses = computed(() => {
  const baseClasses = getNodeStatusClasses(props.tnode?.status || '', 'simple');
  
  // Add animation for active status
  if (props.tnode?.status === 'active') {
    return `${baseClasses} animate-pulse`;
  }
  
  return baseClasses;
});

// Status ring colors
const statusRingClasses = computed(() => {
  switch (props.tnode?.status) {
    case 'active': return 'ring-green-400/30';
    case 'paused': return 'ring-yellow-400/30';
    case 'completed': return 'ring-blue-400/30';
    case 'failed': return 'ring-red-400/30';
    default: return 'ring-neutral-400/30';
  }
});

// Format timestamp helper
const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit'
  });
};

const handleClick = () => {
  if (props.tnode.children.length > 0) {
    expanded.value = !expanded.value;
  }
  emit('tnode-click', props.tnode.id);
};
</script>

<style scoped>
.tnode-item {
  user-select: none;
  margin-bottom: 0.25rem;
  width: 100%;
}

.tnode-container {
  border-radius: 0.375rem;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.2s ease;
  
  &.expanded {
    background: rgba(255, 255, 255, 0.03);
    border-color: rgba(255, 255, 255, 0.05);
  }
  
  &:hover {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
  }
}

.tnode-header {
  transform-origin: center;
  position: relative;
  text-align: left;
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
  /* Subtle transition for better UX */
  transition: all 0.15s ease;
}

.tnode-header:hover {
  transform: translateX(1px);
}

/* Enhanced visual feedback on click */
.tnode-header:active {
  transform: scale(0.995);
}

/* Smooth transitions for all interactive elements */
.tnode-header * {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

/* Children container with nested appearance */
.tnode-children {
  position: relative;
  padding: 0.5rem 0.75rem;
  animation: slideIn 0.15s ease-out;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

/* Remove bottom margin from last child */
.tnode-children .tnode-item:last-child {
  margin-bottom: 0;
}

/* Ensure children don't exceed parent width */
.tnode-children .tnode-item {
  max-width: 100%;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Reduce visual weight for deeply nested items */
.tnode-item:has(.tnode-item .tnode-item .tnode-item) .tnode-header {
  font-size: 0.6875rem; /* 11px */
}

/* Style adjustments for nested levels */
.tnode-item.has-children .tnode-container {
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

/* Subtle depth indicators */
.tnode-item[style*="marginLeft: 0px"] .tnode-container {
  background: rgba(59, 130, 246, 0.03);
  border-color: rgba(59, 130, 246, 0.08);
}

.tnode-item[style*="marginLeft: 0px"] .tnode-container:hover {
  background: rgba(59, 130, 246, 0.05);
  border-color: rgba(59, 130, 246, 0.12);
}
</style> 