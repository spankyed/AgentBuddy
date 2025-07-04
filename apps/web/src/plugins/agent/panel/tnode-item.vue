<template>
  <div class="tnode-item">
    <button
      class="relative w-full overflow-hidden tnode-button group mb-1"
      :class="[itemClasses, { 'opacity-75': level > 0 }]"
      :style="{ marginLeft: `${level * 24}px` }"
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
          v-if="hasChildren" 
          :class="['w-3.5 h-3.5 text-neutral-500 transition-all flex-shrink-0', 
                   { 'rotate-90': isExpanded, 'text-neutral-300': isExpanded }]"
        />
        <div v-else-if="level === 0" class="flex-shrink-0 w-3.5" /> <!-- Spacer for root items only -->
        
        <!-- Icon dot with enhanced styling -->
        <div 
          class="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-offset-1 ring-offset-neutral-900/50 transition-all duration-200"
          :class="iconDotClasses"
        />
        
        <!-- Node label with context -->
        <div class="flex-1 flex flex-col">
          <span class="text-xs font-medium tracking-tight text-left transition-colors duration-200 text-white/90 group-hover:text-white">
            {{ node.label || getNodeTypeLabel() }}
          </span>
          <!-- Add timestamp for event nodes -->
          <span v-if="node.tNodeType === 'event' && node.startedAt" class="text-[10px] text-neutral-500 mt-0.5">
            {{ formatTimestamp(node.startedAt) }}
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
          v-if="node.status"
          class="relative ml-1 flex items-center"
        >
          <div
            :class="[
              'rounded-full transition-all',
              level === 0 ? 'w-1.5 h-1.5 ring-2 ring-offset-2 ring-offset-neutral-900' : 'w-1 h-1 ring-1 ring-offset-1 ring-offset-neutral-900',
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
    
    <!-- Children (recursive) -->
    <div v-if="isExpanded && hasChildren" class="mt-1 tnode-children">
      <TnodeItem
        v-for="childId in childIds"
        :key="childId"
        :node-id="childId"
        :normalized-tree="normalizedTree"
        :level="level + 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import type { TNodeEntity, NodeKind } from '@abuddy/api';
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


interface Props {
  nodeId: string;
  normalizedTree: {
    byId: Record<string, TNodeEntity>;
    childrenById: Record<string, string[]>;
  };
  level?: number;
}

const props = withDefaults(defineProps<Props>(), {
  level: 0
});

const node = computed(() => props.normalizedTree.byId[props.nodeId]);
const childIds = computed(() => props.normalizedTree.childrenById[props.nodeId] || []);
const hasChildren = computed(() => childIds.value.length > 0);
const isExpanded = ref(true);

// Map TNode type to actual node type for styling
const effectiveNodeType = computed((): string => {
  if (!node.value) return 'neutral';
  
  // For step nodes, use the actual node type
  if (node.value.tNodeType === 'step' && node.value.stepNodeType) {
    return node.value.stepNodeType;
  }
  
  // Map other TNode types
  switch (node.value.tNodeType) {
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

// Get label for the node with better formatting
const getNodeTypeLabel = () => {
  if (!node.value) return 'Unknown';
  
  // For step nodes, use the step node type as label if no label exists
  if (node.value.tNodeType === 'step' && !node.value.label && node.value.stepNodeType) {
    const config = getNodeConfig(node.value.stepNodeType as NodeKind);
    return config?.label || node.value.stepNodeType;
  }
  
  // Better default labels for different node types
  switch (node.value.tNodeType) {
    case 'flow': return 'Flow Entry';
    case 'event': 
      // Try to use eventType if available
      if (node.value.eventType) {
        // Format event type nicely (e.g., "user.message" -> "User Message")
        return node.value.eventType
          .split('.')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
      }
      return 'Event';
    case 'step': return 'Step';
    default: return node.value.tNodeType;
  }
};

// Styling classes from node-config
const itemClasses = computed(() => getPaletteItemClasses(effectiveNodeType.value));
const glowClasses = computed(() => getPaletteGlowClasses(effectiveNodeType.value));
const iconDotClasses = computed(() => getPaletteIconClasses(effectiveNodeType.value));
const iconComponentClasses = computed(() => getPaletteIconComponentClasses(effectiveNodeType.value));
const gradientClasses = computed(() => getPaletteGradientClasses(effectiveNodeType.value));

// Status styling with proper animation
const statusClasses = computed(() => {
  const baseClasses = getNodeStatusClasses(node.value?.status || '', 'simple');
  
  // Add animation for active status
  if (node.value?.status === 'active') {
    return `${baseClasses} animate-pulse`;
  }
  
  return baseClasses;
});

// Status ring colors
const statusRingClasses = computed(() => {
  switch (node.value?.status) {
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
    minute: '2-digit', 
    second: '2-digit' 
  });
};

const handleClick = () => {
  if (hasChildren.value) {
    isExpanded.value = !isExpanded.value;
  }
  // TODO: Add click handler to open TNode details
};
</script>

<style scoped>
.tnode-item {
  user-select: none;
}

.tnode-button {
  transform-origin: center;
  position: relative;
  text-align: left;
  /* Subtle transition for better UX */
  transition: all 0.15s ease;
}

.tnode-button:hover {
  transform: translateX(1px);
}

/* Enhanced visual feedback on click */
.tnode-button:active {
  transform: scale(0.985);
}

/* Smooth transitions for all interactive elements */
.tnode-button * {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

/* Children container with better spacing */
.tnode-children {
  position: relative;
  animation: slideIn 0.15s ease-out;
  
  /* Add connection line for visual hierarchy */
  &::before {
    content: '';
    position: absolute;
    left: 11px;
    top: -4px;
    bottom: 4px;
    width: 1px;
    background: linear-gradient(to bottom, 
      transparent 0%, 
      rgba(255, 255, 255, 0.05) 10%,
      rgba(255, 255, 255, 0.05) 90%,
      transparent 100%
    );
    pointer-events: none;
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Reduce visual weight for deeply nested items */
.tnode-item:has(.tnode-item .tnode-item .tnode-item) .tnode-button {
  font-size: 0.6875rem; /* 11px */
}
</style>