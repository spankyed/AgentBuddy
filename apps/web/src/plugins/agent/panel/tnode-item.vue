<template>
  <div class="tnode-item" :style="{ paddingLeft: `${level * 20}px` }">
    <button
      class="relative w-full overflow-hidden tnode-button group"
      :class="itemClasses"
      @click="handleClick"
    >
      <!-- Glow effect on hover -->
      <div 
        class="absolute inset-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100 blur-xl"
        :class="glowClasses"
      />
      
      <!-- Main content -->
      <div class="relative z-10 flex items-center gap-2.5 px-3 py-2">
        <!-- Expand/Collapse icon for nodes with children -->
        <ChevronRight 
          v-if="hasChildren" 
          :class="['w-3 h-3 text-neutral-400 transition-transform flex-shrink-0', { 'rotate-90': isExpanded }]"
        />
        <div v-else class="flex-shrink-0 w-3" /> <!-- Spacer for alignment -->
        
        <!-- Icon dot with enhanced styling -->
        <div 
          class="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-offset-1 ring-offset-neutral-900/50 transition-all duration-200"
          :class="iconDotClasses"
        />
        
        <!-- Node label -->
        <span class="flex-1 text-xs font-medium tracking-tight text-left transition-colors duration-200 text-white/90 group-hover:text-white">
          {{ node.label || getNodeTypeLabel() }}
        </span>
        
        <!-- Node type icon -->
        <component
          :is="nodeIcon"
          class="w-3.5 h-3.5 transition-all duration-200"
          :class="iconComponentClasses"
        />
        
        <!-- Status indicator -->
        <div 
          v-if="node.status"
          class="relative ml-2"
        >
          <div
            class="w-2 h-2 rounded-full"
            :class="statusClasses"
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

// Get label for the node
const getNodeTypeLabel = () => {
  if (!node.value) return 'Unknown';
  
  // For step nodes, use the step node type as label if no label exists
  if (node.value.tNodeType === 'step' && !node.value.label && node.value.stepNodeType) {
    const config = getNodeConfig(node.value.stepNodeType as NodeKind);
    return config?.label || node.value.stepNodeType;
  }
  
  return node.value.tNodeType;
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
}

.tnode-button:hover {
  transform: translateY(-0.5px);
}

/* Enhanced visual feedback on click */
.tnode-button:active {
  transform: scale(0.98);
}

/* Smooth transitions for all interactive elements */
.tnode-button * {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

/* Children container animation */
.tnode-children {
  animation: slideIn 0.2s ease-out;
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
</style>