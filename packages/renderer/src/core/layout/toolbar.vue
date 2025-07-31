<template>
  <div class="toolbar flex flex-col flex-shrink-0 h-full text-white border-r border-neutral-800">
    <!-- Window controls area (macOS traffic lights) -->
    <div class="window-controls-area h-[57px] flex items-center justify-center">
      <WindowControls v-if="!isMac" />
    </div>
    
    <div class="flex flex-col h-full py-4">
      <!-- Scrollable section -->
      <div class="flex-1 overflow-y-auto scrollbar-hide">
        <div class="flex flex-col items-center space-y-6">
          <button
            v-for="item in pluginItems"
            :key="item.id"
            :class="[
              'p-2 rounded-lg transition-all duration-200 ease-in-out',
              activePlugin.id === item.id
                ? 'bg-primary-600 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-primary-700'
            ]"
            @click="$emit('select-plugin', item.id)"
            :title="item.label"
          >
            <component :is="item.icon" :size="24" />
          </button>
        </div>
      </div>

      <!-- Pinned bottom section -->
      <div class="flex flex-col items-center pt-6 mt-auto space-y-6 border-t border-neutral-800">
        <button
          v-for="item in pinnedItems"
          :key="item.id"
          :class="[
            'p-2 rounded-lg transition-all duration-200 ease-in-out',
            activePlugin.id === item.id
              ? 'bg-primary-600 text-white'
              : 'text-neutral-400 hover:text-white hover:bg-primary-700'
          ]"
          @click="$emit('select-plugin', item.id)"
          :title="item.label"
        >
          <component :is="item.icon" :size="24" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Plugin } from '@/core/types';
import { computed } from 'vue';
import WindowControls from './WindowControls.vue';

defineEmits<(e: 'select-plugin', id: string) => void>();

const props = defineProps<{
  activePlugin: Plugin;
  plugins: Plugin[];
}>();

const pluginItems = computed(() => props.plugins.filter((item) => !item.isPinned));
const pinnedItems = computed(() => props.plugins.filter((item) => item.isPinned));

const isMac = computed(() => {
  return navigator.platform.toLowerCase().includes('mac');
});
</script>

<style lang="scss">
.toolbar {
  --toolbar-width: 4.5rem; /* 72px - default width */
  width: var(--toolbar-width);
  min-width: var(--toolbar-width);
  flex-shrink: 0;
}

.window-controls-area {
  -webkit-app-region: drag;
  user-select: none;
}

/* Ensure buttons in toolbar are not draggable */
button {
  -webkit-app-region: no-drag;
}

.scrollbar-hide {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;  /* Chrome, Safari and Opera */
}
</style> 