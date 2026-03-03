<template>
  <div class="flex items-center gap-2">
    <button
      @click="$emit('toggleMode')"
      class="flex items-center gap-1.5 px-2 @xl:px-3 py-1.5 text-sm font-medium rounded transition-colors"
      :class="mode === 'query' ? 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50' : 'bg-orange-900/30 text-orange-400 hover:bg-orange-900/50'"
      :title="`Switch to ${mode === 'query' ? 'Transaction' : 'Query'} mode`"
    >
      <component :is="mode === 'query' ? Database : Edit3" class="w-3.5 h-3.5" />
      <span class="hidden @xl:inline">{{ mode === 'query' ? 'Query' : 'Transaction' }}</span>
    </button>
    
    <div class="w-px h-5 bg-neutral-200 dark:bg-neutral-700"></div>
    
    <button
      @click="$emit('execute')"
      :disabled="isLoading || isDisabled"
      class="flex items-center gap-2 px-2 @xl:px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
    >
      <component :is="isLoading ? Loader2 : Play" :class="['w-3.5 h-3.5', isLoading && 'animate-spin']" />
      <span class="hidden @xl:inline">{{ isLoading ? 'Running...' : 'Execute' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Play, Loader2, Database, Edit3 } from 'lucide-vue-next';

defineProps<{
  isLoading: boolean;
  isDisabled: boolean;
  mode: 'query' | 'transaction';
}>();

defineEmits<{
  execute: [];
  toggleMode: [];
}>();
</script> 