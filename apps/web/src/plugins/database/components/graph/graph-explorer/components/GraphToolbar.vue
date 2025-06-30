<template>
  <div class="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-neutral-800 dark:bg-gray-800">
    <div class="flex items-center gap-3">
      <!-- Layout Selector -->
      <LayoutSelector 
        :model-value="currentLayout" 
        :layouts="layouts"
        :disabled="!hasData"
        @update:model-value="$emit('update:currentLayout', $event)"
        @change="$emit('layout-change', $event)"
      />
      
      <!-- Graph Stats -->
      <div class="flex items-center gap-3 px-3 py-1.5 bg-neutral-800 dark:bg-gray-700 rounded-md">
        <div class="flex items-center gap-1.5 text-xs">
          <div class="w-2 h-2 bg-blue-500 rounded-full" />
          <span class="font-medium text-neutral-200 dark:text-gray-300">{{ nodeCount }}</span>
          <span class="text-neutral-400 dark:text-gray-400">{{ nodeCount === 1 ? 'node' : 'nodes' }}</span>
        </div>
        <div class="w-px h-4 bg-neutral-700 dark:bg-gray-700" />
        <div class="flex items-center gap-1.5 text-xs">
          <div class="w-2 h-2 bg-neutral-400 rounded-full" />
          <span class="font-medium text-neutral-200 dark:text-gray-300">{{ edgeCount }}</span>
          <span class="text-neutral-400 dark:text-gray-400">{{ edgeCount === 1 ? 'edge' : 'edges' }}</span>
        </div>
      </div>
    </div>
    
    <!-- Action Buttons -->
    <div class="flex items-center gap-2">
      <!-- View Controls Group -->
      <div class="flex items-center bg-neutral-800 dark:bg-gray-700 rounded-md p-0.5">
        <!-- Zoom Controls -->
        <div class="flex items-center">
          <button
            @click="$emit('zoom-out')"
            :disabled="!canZoomOut"
            class="p-1.5 text-neutral-400 dark:text-gray-400 hover:text-neutral-100 dark:hover:text-gray-100 hover:bg-neutral-700 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            title="Zoom out (Ctrl+-)"
          >
            <ZoomOut class="w-4 h-4" />
          </button>
          
          <div class="px-2 min-w-[3.5rem] text-center">
            <span class="text-xs font-medium text-neutral-400 dark:text-gray-400 select-none">
              {{ Math.round(zoomLevel * 100) }}%
            </span>
          </div>
          
          <button
            @click="$emit('zoom-in')"
            :disabled="!canZoomIn"
            class="p-1.5 text-neutral-400 dark:text-gray-400 hover:text-neutral-100 dark:hover:text-gray-100 hover:bg-neutral-700 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            title="Zoom in (Ctrl+=)"
          >
            <ZoomIn class="w-4 h-4" />
          </button>
        </div>
        
        <div class="w-px h-5 bg-neutral-700 dark:bg-gray-700 mx-0.5" />
        
        <!-- Fit to View -->
        <button
          @click="$emit('fit-view')"
          :disabled="!hasGraphInstance"
          class="p-1.5 text-neutral-400 dark:text-gray-400 hover:text-neutral-100 dark:hover:text-gray-100 hover:bg-neutral-700 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          title="Fit to view (Ctrl+0)"
        >
          <Maximize2 class="w-4 h-4" />
        </button>
        
        <!-- Fullscreen -->
        <button
          @click="$emit('toggle-fullscreen')"
          class="p-1.5 text-neutral-400 dark:text-gray-400 hover:text-neutral-100 dark:hover:text-gray-100 hover:bg-neutral-700 dark:hover:bg-gray-600 rounded transition-all"
          :class="{ 'bg-neutral-800 dark:bg-gray-600 text-neutral-100 dark:text-gray-100': isFullscreen }"
          title="Toggle fullscreen (F11)"
        >
          <component :is="isFullscreen ? Minimize2 : Maximize" class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Maximize,
  Minimize2
} from 'lucide-vue-next';
import LayoutSelector from './LayoutSelector.vue';
import type { Layout } from './LayoutSelector.vue';

interface Props {
  currentLayout: string;
  layouts: Layout[];
  hasData: boolean;
  hasGraphInstance: boolean;
  nodeCount: number;
  edgeCount: number;
  zoomLevel: number;
  isFullscreen: boolean;
}

const props = defineProps<Props>();

defineEmits<{
  'update:currentLayout': [value: string];
  'layout-change': [layout: string];
  'zoom-in': [];
  'zoom-out': [];
  'fit-view': [];
  'toggle-fullscreen': [];
}>();

// Computed properties for button states
const canZoomIn = computed(() => props.hasGraphInstance && props.zoomLevel < 3);
const canZoomOut = computed(() => props.hasGraphInstance && props.zoomLevel > 0.3);
</script> 