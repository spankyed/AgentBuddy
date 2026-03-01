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
    </div>
    
    <div class="flex items-center gap-2">
      <QueryEditorMessages
        :error="error"
        :success-message="successMessage"
      />
      <KeyboardHint :execute-query="executeQuery" />
      
      
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
import { FileX, Wand2 } from 'lucide-vue-next';
import ModeTabs from './ModeTabs.vue';
import KeyboardHint from './KeyboardHint.vue';
import QueryEditorMessages from './QueryEditorMessages.vue';
import QueryEditorActions from './QueryEditorActions.vue';

import type { KeyboardShortcut } from '@app/api';

defineProps<{
  activeMode: 'query' | 'examples';
  isLoading: boolean;
  currentQuery: string;
  error: string | null;
  successMessage: string;
  mode: 'query' | 'transaction';
  executeQuery?: KeyboardShortcut;
}>();

defineEmits<{
  'update:activeMode': [mode: 'query' | 'examples'];
  execute: [];
  clear: [];
  'magic-prompt': [];
  toggleMode: [];
}>();
</script> 