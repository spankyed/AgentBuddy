<template>
  <div class="flex items-center gap-2">
    <button
      @click="$emit('clear')"
      class="p-1.5 text-neutral-500 hover:text-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-800 dark:hover:bg-neutral-700 rounded transition-colors"
      title="Clear query"
    >
      <FileX class="w-4 h-4" />
    </button>
    
    <button
      @click="$emit('format')"
      class="p-1.5 text-neutral-500 hover:text-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-800 dark:hover:bg-neutral-700 rounded transition-colors"
      title="Format query"
    >
      <Wand2 class="w-4 h-4" />
    </button>
    
    <div class="w-px h-5 bg-neutral-200 dark:bg-neutral-700"></div>
    
    <button
      @click="$emit('execute')"
      :disabled="isLoading || isDisabled"
      class="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
    >
      <component :is="isLoading ? Loader2 : Play" :class="['w-3.5 h-3.5', isLoading && 'animate-spin']" />
      {{ isLoading ? 'Running...' : 'Run Query' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { Play, Loader2, FileX, Wand2 } from 'lucide-vue-next';

defineProps<{
  isLoading: boolean;
  isDisabled: boolean;
}>();

defineEmits<{
  execute: [];
  clear: [];
  format: [];
}>();
</script> 