<template>
  <div class="flex items-center gap-1 p-1 bg-neutral-800 rounded-lg dark:bg-gray-800">
    <button
      @click="$emit('zoom-out')"
      :disabled="disabled"
      class="p-1 text-neutral-400 transition-colors rounded hover:text-neutral-100 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-neutral-600 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Zoom out (Ctrl + -)"
    >
      <ZoomOut class="w-3.5 h-3.5" />
    </button>
    
    <span class="px-2 text-xs font-medium text-neutral-400 dark:text-gray-400 select-none">
      {{ Math.round(zoomLevel * 100) }}%
    </span>
    
    <button
      @click="$emit('zoom-in')"
      :disabled="disabled"
      class="p-1 text-neutral-400 transition-colors rounded hover:text-neutral-100 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-neutral-600 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Zoom in (Ctrl + =)"
    >
      <ZoomIn class="w-3.5 h-3.5" />
    </button>
    
    <div class="w-px h-4 mx-1 bg-gray-300 dark:bg-gray-600" />
    
    <button
      @click="$emit('fit-view')"
      :disabled="disabled"
      class="p-1 text-neutral-400 transition-colors rounded hover:text-neutral-100 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-neutral-600 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Fit to view (Ctrl + 0)"
    >
      <Maximize2 class="w-3.5 h-3.5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-vue-next';

interface Props {
  zoomLevel: number;
  disabled?: boolean;
}

defineProps<Props>();

defineEmits<{
  'zoom-in': [];
  'zoom-out': [];
  'fit-view': [];
}>();
</script> 