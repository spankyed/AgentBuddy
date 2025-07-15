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
    
    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button 
          class="p-1.5 text-neutral-500 hover:text-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-800 dark:hover:bg-neutral-700 rounded transition-colors" 
          title="Actions menu"
        >
          <MoreVertical class="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent 
          class="bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[180px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)]" 
          :side="'bottom'" 
          :side-offset="8"
        >
          <DropdownMenuItem 
            class="flex items-center gap-2 px-3 py-2 text-sm transition-all duration-200 rounded outline-none cursor-pointer text-neutral-50 hover:bg-neutral-700 focus:bg-neutral-700" 
            @select="$emit('saveSnapshot')"
          >
            <Camera :size="16" class="flex-shrink-0 text-primary-500" />
            Save Snapshot
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
    
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
import { Play, Loader2, FileX, Wand2, Camera, MoreVertical } from 'lucide-vue-next';
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from 'reka-ui';

defineProps<{
  isLoading: boolean;
  isDisabled: boolean;
}>();

defineEmits<{
  execute: [];
  clear: [];
  format: [];
  saveSnapshot: [];
}>();
</script> 