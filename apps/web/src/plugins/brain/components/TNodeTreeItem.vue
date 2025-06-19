<template>
  <div>
    <div
      class="flex items-center px-2 py-1 transition-all duration-200 rounded-md cursor-pointer group hover:bg-white/[0.03]"
      :style="{ paddingLeft: `${depth * 1.25 + 0.5}rem` }"
      @click="$emit('tnode-click', tnode.id)"
    >
      <!-- Expand/Collapse Icon -->
      <div class="flex items-center justify-center w-4 h-4 mr-1">
        <svg
          v-if="tnode.children.length > 0"
          class="w-3.5 h-3.5 transition-all duration-200 text-neutral-600 hover:text-neutral-400"
          :class="{ 'rotate-90': expanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          @click.stop="expanded = !expanded"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      
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
import { 
  Workflow, 
  Radio, 
  Zap, 
  Play, 
  Plus, 
  RefreshCw, 
  Search, 
  Split, 
  Shuffle, 
  Activity,
  Calendar 
} from 'lucide-vue-next';

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
  switch (props.tnode.nodeType) {
    case 'flow':
      return Workflow;
    case 'event':
      return Calendar; // Default for event type
    case 'step':
      switch (props.tnode.stepNodeType) {
        case 'listen':
          return Radio;
        case 'fire':
          return Zap;
        case 'action':
          return Play;
        case 'create':
          return Plus;
        case 'update':
          return RefreshCw;
        case 'query':
          return Search;
        case 'decision':
          return Split;
        case 'transform':
          return Shuffle;
        case 'keep-alive':
          return Activity;
        case 'flow':
          return Workflow;
        default:
          return Play; // Default icon
      }
    default:
      return Play; // Default icon
  }
});

const nodeIconColor = computed(() => {
  // More subtle, sophisticated colors
  switch (props.tnode.nodeType) {
    case 'flow':
      return 'text-purple-400';
    case 'event':
      return 'text-blue-400';
    case 'step':
      switch (props.tnode.stepNodeType) {
        case 'listen':
          return 'text-blue-400';
        case 'query':
          return 'text-cyan-400';
        case 'create':
        case 'update':
          return 'text-purple-400';
        case 'fire':
          return 'text-amber-400';
        case 'decision':
          return 'text-orange-400';
        case 'transform':
          return 'text-emerald-400';
        case 'flow':
          return 'text-purple-400';
        default:
          return 'text-neutral-400';
      }
    default:
      return 'text-neutral-400';
  }
});

const nodeIconBgColor = computed(() => {
  // Subtle background colors with low opacity
  switch (props.tnode.nodeType) {
    case 'flow':
      return 'bg-purple-500/10 group-hover:bg-purple-500/15';
    case 'event':
      return 'bg-blue-500/10 group-hover:bg-blue-500/15';
    case 'step':
      switch (props.tnode.stepNodeType) {
        case 'listen':
          return 'bg-blue-500/10 group-hover:bg-blue-500/15';
        case 'query':
          return 'bg-cyan-500/10 group-hover:bg-cyan-500/15';
        case 'create':
        case 'update':
          return 'bg-purple-500/10 group-hover:bg-purple-500/15';
        case 'fire':
          return 'bg-amber-500/10 group-hover:bg-amber-500/15';
        case 'decision':
          return 'bg-orange-500/10 group-hover:bg-orange-500/15';
        case 'transform':
          return 'bg-emerald-500/10 group-hover:bg-emerald-500/15';
        case 'flow':
          return 'bg-purple-500/10 group-hover:bg-purple-500/15';
        default:
          return 'bg-neutral-500/10 group-hover:bg-neutral-500/15';
      }
    default:
      return 'bg-neutral-500/10 group-hover:bg-neutral-500/15';
  }
});
</script> 