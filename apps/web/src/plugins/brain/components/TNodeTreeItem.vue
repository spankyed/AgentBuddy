<template>
  <div>
    <div
      class="flex items-center transition-all duration-200 cursor-pointer group"
      :style="{ paddingLeft: `${depth * 1 + 0.5}rem` }"
    >
      <!-- Expand/Collapse Icon -->
      <div class="flex items-center justify-center w-4 h-full mr-1" @click.stop="expanded = !expanded">
        <svg
          v-if="tnode.children.length > 0"
          class="w-3.5 h-3.5 transition-all duration-200 text-neutral-600 hover:text-neutral-400"
          :class="{ 'rotate-90': expanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      
      <!-- Main content area with hover effect -->
      <div 
        class="flex flex-1 items-center px-2 py-1 rounded-md hover:bg-white/[0.03]"
        @click="$emit('tnode-click', tnode.id)"
      >
        <!-- Node Type Icon with subtle background -->
      <div class="relative flex items-center justify-center flex-shrink-0 w-6 h-6 mr-2 transition-all duration-200 rounded"
           :class="nodeIconBgColor">
        <component 
          :is="nodeIcon" 
          class="w-3.5 h-3.5 transition-colors duration-200"
          :class="nodeIconColor"
        />
      </div>
      
      <!-- Label with better typography -->
      <span class="text-sm font-medium leading-none truncate transition-colors duration-200 select-none text-neutral-100 group-hover:text-white">
        {{ tnode.label }}
      </span>
      
      <!-- Status Indicator - Always visible -->
      <div class="flex-shrink-0 pl-2 ml-auto">
        <StatusIndicator :status="tnode.status" />
      </div>
      </div>
    </div>
    
    <!-- Children with subtle hierarchy line -->
    <div v-if="expanded && tnode.children.length > 0" class="relative">
      <div 
        class="absolute top-0 bottom-0 left-0 w-[0.0625rem] bg-gradient-to-b from-neutral-700/20 via-neutral-700/10 to-transparent"
        :style="{ marginLeft: `${depth * 1.25 + 1}rem` }"
      />
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
import { getNodeConfig } from '../../flows/config/node-config';
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
  if (props.tnode.nodeType === 'event') {
    return Calendar;
  }
  
  const nodeType = (props.tnode.nodeType === 'step' ? props.tnode.stepNodeType : props.tnode.nodeType) as NodeKind;
  const config = getNodeConfig(nodeType);
  return config?.icon || Calendar;
});

const nodeIconColor = computed(() => {
  if (props.tnode.nodeType === 'event') {
    return 'text-blue-400';
  }
  
  const nodeType = (props.tnode.nodeType === 'step' ? props.tnode.stepNodeType : props.tnode.nodeType) as NodeKind;
  const config = getNodeConfig(nodeType);
  return config?.color || 'text-neutral-400';
});

const nodeIconBgColor = computed(() => {
  if (props.tnode.nodeType === 'event') {
    return 'bg-blue-500/10 group-hover:bg-blue-500/15';
  }
  
  const nodeType = (props.tnode.nodeType === 'step' ? props.tnode.stepNodeType : props.tnode.nodeType) as NodeKind;
  const config = getNodeConfig(nodeType);
  return config ? `${config.bgColor} ${config.hoverBgColor}` : 'bg-neutral-500/10 group-hover:bg-neutral-500/15';
});
</script> 