<template>
  <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
    <ModeTabs
      :active-mode="activeMode"
      @update:active-mode="$emit('update:activeMode', $event)"
    />
    
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
        @clear="$emit('clear')"
        @format="$emit('format')"
        @save-snapshot="$emit('saveSnapshot')"
        @toggle-mode="$emit('toggleMode')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
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
  format: [];
  saveSnapshot: [];
  toggleMode: [];
}>();
</script> 