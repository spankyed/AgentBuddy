<template>
  <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
    <div class="flex items-center gap-2">
      <ModeTabs
        :active-mode="activeMode"
        @update:active-mode="$emit('update:activeMode', $event)"
      />
      
      <div class="w-px h-5 bg-neutral-200 dark:bg-neutral-700"></div>
      
      <button
        @click="$emit('clear')"
        class="p-1.5 text-neutral-500 hover:text-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-800 dark:hover:bg-neutral-700 rounded transition-colors"
        title="Clear query"
      >
        <FileX class="w-4 h-4" />
      </button>
      
      <button
        @click="$emit('magic-prompt')"
        class="p-1.5 text-neutral-500 hover:text-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-800 dark:hover:bg-neutral-700 rounded transition-colors"
        title="Generate query with AI"
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
              @select="$emit('viewTrace')"
            >
              <History :size="16" class="flex-shrink-0 text-purple-400" />
              View Trace History
            </DropdownMenuItem>
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
    </div>
    
    <div class="flex items-center gap-2">
      <QueryEditorMessages
        :error="error"
        :success-message="successMessage"
      />
      <KeyboardHint />
      
      
      <QueryEditorActions
        :is-loading="isLoading"
        :is-disabled="!currentQuery.trim()"
        :mode="mode"
        @execute="$emit('execute')"
        @toggle-mode="$emit('toggleMode')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileX, Wand2, Camera, MoreVertical, History } from 'lucide-vue-next';
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from 'reka-ui';
import ModeTabs from './ModeTabs.vue';
import KeyboardHint from './KeyboardHint.vue';
import QueryEditorMessages from './QueryEditorMessages.vue';
import QueryEditorActions from './QueryEditorActions.vue';

defineProps<{
  activeMode: 'query' | 'examples';
  isLoading: boolean;
  currentQuery: string;
  error: string | null;
  successMessage: string;
  mode: 'query' | 'transaction';
}>();

defineEmits<{
  'update:activeMode': [mode: 'query' | 'examples'];
  execute: [];
  clear: [];
  'magic-prompt': [];
  saveSnapshot: [];
  toggleMode: [];
  viewTrace: [];
}>();
</script> 