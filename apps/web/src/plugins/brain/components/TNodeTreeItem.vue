<template>
  <div>
    <div
      class="flex items-center transition-colors duration-150 cursor-pointer group"
      :style="{ paddingLeft: `${depth * 0.75 + 0.25}rem` }"
      @click="$emit('tnode-click', tnode.id)"
    >
      <!-- Expand/Collapse Icon -->
      <div 
        class="flex items-center justify-center flex-shrink-0 w-4 h-4 mr-1" 
        @click.stop="expanded = !expanded"
      >
        <svg
          v-if="tnode.children.length > 0"
          class="w-3 h-3 transition-transform duration-150 text-neutral-600"
          :class="{ 'rotate-90': expanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      
      <!-- Main content area -->
      <div 
        class="flex items-center flex-1 min-w-0 gap-2 px-2 py-1 rounded-md hover:bg-neutral-900/50"
      >
        <!-- Node Type Icon (before label for flow items with children) -->
        <div v-if="tnode.children.length > 0" 
             class="flex items-center justify-center flex-shrink-0 w-5 h-5 rounded"
             :class="nodeIconBgColor">
          <component 
            :is="nodeIcon" 
            class="w-3 h-3"
            :class="nodeIconColor"
          />
        </div>
        
        <!-- Label -->
        <span class="flex-1 min-w-0 text-sm font-medium truncate text-neutral-100">
          {{ tnode.label }}
        </span>
        
        <!-- Node Type Icon (after label for leaf nodes) -->
        <div v-if="tnode.children.length === 0"
             class="flex items-center justify-center flex-shrink-0 w-5 h-5 rounded"
             :class="nodeIconBgColor">
          <component 
            :is="nodeIcon" 
            class="w-3 h-3"
            :class="nodeIconColor"
          />
        </div>
        
        <!-- Status Indicator -->
        <div class="flex-shrink-0">
          <StatusIndicator :status="tnode.status" />
        </div>
      </div>
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
import { Calendar } from 'lucide-vue-next';
import { getNodeConfig, getNodeIconTextColor, getNodeIconBgColor } from '../../flows/config/node-config';
import type { NodeKind } from '@abuddy/api';

interface Props {
  tnode: TrackEntity;
  depth: number;
}

const props = defineProps<Props>();

defineEmits<{
  'tnode-click': [tNodeId: string];
}>();

const expanded = ref(true);

const nodeIcon = computed(() => {
  const tNodeType = (props.tnode.tNodeType === 'event' ? 'listen' : props.tnode.stepNodeType) as NodeKind;
  const config = getNodeConfig(tNodeType);
  return config?.icon || Calendar;
});

const nodeIconColor = computed(() => {
  const nodeType = props.tnode.tNodeType === 'step' ? (props.tnode.stepNodeType || 'action') : props.tnode.tNodeType;
  return getNodeIconTextColor(nodeType, { isEvent: props.tnode.tNodeType === 'event' });
});

const nodeIconBgColor = computed(() => {
  const nodeType = props.tnode.tNodeType === 'step' ? (props.tnode.stepNodeType || 'action') : props.tnode.tNodeType;
  return getNodeIconBgColor(nodeType, { isEvent: props.tnode.tNodeType === 'event' });
});

// Note: nodeTypeBadgeColor is defined but not used in the template
// If needed in the future, it can use the shared function:
// const nodeTypeBadgeColor = computed(() => {
//   const nodeType = props.tnode.tNodeType === 'step' ? props.tnode.stepNodeType : props.tnode.tNodeType;
//   return getNodeBadgeClasses(nodeType, { isEvent: props.tnode.tNodeType === 'event' });
// });
</script> 