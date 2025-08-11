<template>
  <div 
    class="tnode-item"
    :class="{ 'has-children': hasChildren }"
  >
    <div
      class="relative w-full overflow-hidden tnode-container group"
      :class="[itemClasses, hasChildren && isExpanded ? 'expanded' : '']"
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
            v-if="hasChildren" 
            :class="[
              'w-3.5 h-3.5 text-neutral-500 transition-all flex-shrink-0', 
              { 'rotate-90': isExpanded, 'text-neutral-300': isExpanded }
            ]"
          />
          
          <!-- Icon dot with enhanced styling -->
          <div 
            class="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-offset-1 ring-offset-neutral-900/50 transition-all duration-200"
            :class="iconDotClasses"
          />
          
          <!-- Node label with context -->
          <div class="relative flex items-center flex-1 min-w-0 pr-16 text-left">
            <span class="block text-xs font-medium tracking-tight truncate transition-colors duration-200 text-white/90 group-hover:text-white">
              {{ node.label || getNodeTypeLabel() }}
            </span>
            <!-- Show key attribute for step nodes -->
            <span v-if="node.tNodeType === 'step' && keyAttribute" class="text-[10px] ml-2 mt-1 text-neutral-500 truncate block">
              {{ keyAttribute }}
            </span>
            <!-- Timestamp positioned absolutely -->
            <span v-if="node.tNodeType === 'event' && node.startedAt" class="text-[10px] text-neutral-500 absolute right-0 top-1/2 -translate-y-1/2">
              {{ formatTimestamp(node.startedAt) }}
            </span>
            <!-- Todo: Display event data e.g. message -->
          </div>
          
          <!-- Node type icon -->
          <component
            :is="nodeIcon"
            class="w-3.5 h-3.5 transition-all duration-200"
            :class="iconComponentClasses"
          />
          
          <!-- Details indicator -->
          <div 
            v-if="hasDetails"
            class="relative flex items-center"
            @click.stop="toggleDetails"
          >
            <Info 
              :class="[
                'w-3 h-3 transition-all duration-200',
                showDetails ? 'text-blue-400' : 'text-neutral-500 hover:text-neutral-400'
              ]"
            />
          </div>
          
          <!-- Status indicator with better sizing -->
          <div 
            v-if="node.status"
            class="relative flex items-center ml-1"
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
      
      <!-- Node Details Section -->
      <div v-if="showDetails && hasDetails" class="tnode-details">
        <component
          :is="detailComponent"
          :node="node"
          :node-attributes="node.nodeAttributes || {}"
        />
      </div>
      
      <!-- Children nested inside parent container -->
      <div v-if="isExpanded && hasChildren" class="tnode-children">
        <TnodeItem
          v-for="childId in childIds"
          :key="childId"
          :node-id="childId"
          :normalized-tree="normalizedTree"
          :level="level + 1"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronRight, Info } from 'lucide-vue-next';
import type { TNodeEntity, NodeKind } from '@app/api';
import { 
  getInspectionItemClasses,
  getPaletteIconClasses,
  getPaletteIconComponentClasses,
  getPaletteGlowClasses,
  getPaletteGradientClasses,
  getNodeStatusClasses,
  getNodeConfig,
  nodeConfigs
} from '@/plugins/flows/config/node-config';
import LLMNodeDetails from './details/LLMNodeDetails.vue';
import ActionNodeDetails from './details/ActionNodeDetails.vue';
import ListenNodeDetails from './details/ListenNodeDetails.vue';
import FireNodeDetails from './details/FireNodeDetails.vue';
import FlowNodeDetails from './details/FlowNodeDetails.vue';
import DefaultNodeDetails from './details/DefaultNodeDetails.vue';

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
const showDetails = ref(true);

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
const itemClasses = computed(() => getInspectionItemClasses(effectiveNodeType.value));
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
    minute: '2-digit'
  });
};

// Check if node has details to show
const hasDetails = computed(() => {
  return node.value?.tNodeType === 'step' && node.value?.nodeAttributes;
});

// Get the appropriate detail component based on node type
const detailComponent = computed(() => {
  if (!node.value || node.value.tNodeType !== 'step') return null;
  
  switch (node.value.stepNodeType) {
    case 'llm': return LLMNodeDetails;
    case 'action': return ActionNodeDetails;
    case 'listen': return ListenNodeDetails;
    case 'fire': return FireNodeDetails;
    case 'flow': return FlowNodeDetails;
    default: return DefaultNodeDetails;
  }
});

// Get key attribute to display for step nodes
const keyAttribute = computed(() => {
  if (!node.value || node.value.tNodeType !== 'step' || !node.value.nodeAttributes) return null;
  
  const attrs = node.value.nodeAttributes;
  
  switch (node.value.stepNodeType) {
    case 'llm':
      if (attrs.model) return `Model: ${attrs.model}`;
      break;
    case 'action':
      if (attrs.actionId) return `Action: ${attrs.actionId}`;
      break;
    case 'listen':
      if (attrs.eventType) return `Listen: ${attrs.eventType}`;
      break;
    case 'fire':
      if (attrs.eventType) return `Fire: ${attrs.eventType}`;
      break;
    case 'flow':
      if (attrs.flowRef) return `Flow: ${attrs.flowRef}`;
      break;
  }
  
  return null;
});

const handleClick = () => {
  if (hasChildren.value) {
    isExpanded.value = !isExpanded.value;
  }
  // TODO: Add click handler to open TNode details
};

const toggleDetails = () => {
  showDetails.value = !showDetails.value;
};
</script>

<style scoped>
.tnode-item {
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

/* Node details section */
.tnode-details {
  padding: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(0, 0, 0, 0.2);
  animation: slideIn 0.15s ease-out;
}

/* Info icon hover effect */
.tnode-header .info-icon {
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.tnode-header .info-icon:hover {
  opacity: 1;
}
</style>