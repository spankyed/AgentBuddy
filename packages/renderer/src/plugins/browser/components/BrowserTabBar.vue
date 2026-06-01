<template>
  <div class="flex items-center gap-0.5 px-2 py-1.5 bg-neutral-950 border-b border-neutral-800 overflow-x-auto min-h-[36px]">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs max-w-[200px] min-w-[80px] cursor-pointer transition-colors group"
      :class="tab.id === activeTabId
        ? 'bg-neutral-800 text-neutral-100'
        : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'"
      @click="$emit('select', tab.id)"
      @mousedown.middle.prevent="$emit('close', tab.id)"
    >
      <div v-if="tab.isLoading" class="w-3.5 h-3.5 flex-shrink-0 rounded-full border-2 border-neutral-600 border-t-neutral-300 animate-spin" />
      <img
        v-else-if="tab.favicon && !failedFavicons.has(tab.id)"
        :src="tab.favicon"
        class="w-3.5 h-3.5 flex-shrink-0"
        @error="failedFavicons.add(tab.id)"
      />
      <div v-else class="w-3.5 h-3.5 flex-shrink-0 rounded-sm bg-neutral-700" />
      <span class="truncate flex-1">{{ tab.title || 'New Tab' }}</span>
      <button
        class="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-700 transition-opacity text-neutral-400 hover:text-neutral-200"
        @click.stop="$emit('close', tab.id)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- New tab button -->
    <button
      class="flex items-center justify-center w-6 h-6 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors flex-shrink-0"
      @click="$emit('create')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { BrowserTab } from '../state.ts';

const failedFavicons = reactive(new Set<number>());

const props = defineProps<{
  tabs: BrowserTab[];
  activeTabId: number | null;
}>();

// Clear failed state when a tab gets a new favicon URL
const faviconCache = new Map<number, string>();
watch(() => props.tabs, (tabs) => {
  for (const tab of tabs) {
    const prev = faviconCache.get(tab.id);
    if (tab.favicon && tab.favicon !== prev) {
      failedFavicons.delete(tab.id);
    }
    faviconCache.set(tab.id, tab.favicon);
  }
}, { deep: true });

defineEmits<{
  select: [tabId: number];
  close: [tabId: number];
  create: [];
}>();
</script>
