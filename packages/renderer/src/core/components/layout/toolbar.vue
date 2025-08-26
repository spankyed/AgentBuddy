<template>
  <div class="toolbar flex flex-col flex-shrink-0 h-full text-white border-r border-neutral-800">
    <!-- Window controls area (macOS traffic lights) -->
    <div class="window-controls-area h-[50px] flex items-center justify-center">
      <WindowControls v-if="!isMac" />
    </div>
    
    <div class="flex flex-col h-full">
      <!-- Scrollable section -->
      <div 
        class="flex-1 overflow-y-auto scrollbar-hide"
        @dragover="handleDragOver($event, null, false)"
        @drop="handleDrop($event, null, sortedPluginItems.length, false)"
      >
        <div class="flex flex-col items-center space-y-5">
          <div
            v-for="(item, index) in sortedPluginItems"
            :key="item.id"
            :class="getItemClass(item)"
            class="relative toolbar-item-wrapper"
          >
            <button
              :class="[
                'p-2 rounded-lg transition-all duration-200 ease-in-out',
                activePlugin.id === item.id
                  ? 'bg-primary-600 text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-primary-700',
                getButtonClass(item)
              ]"
              @click="$emit('select-plugin', item.id)"
              :title="item.label"
              :draggable="true"
              @dragstart="handleDragStart($event, item)"
              @dragover="handleDragOver($event, item, false)"
              @dragenter="handleDragEnter($event, item)"
              @dragleave="handleDragLeave($event)"
              @drop="handleDrop($event, item, index, false)"
              @dragend="handleDragEnd($event)"
            >
              <component :is="item.icon" :size="24" />
            </button>
            <div :class="['drop-indicator', getDropIndicatorStyle(item)]" />
          </div>
        </div>
      </div>

      <!-- Pinned bottom section -->
      <div 
        class="flex flex-col items-center py-6 mt-auto space-y-5 border-t border-neutral-800"
        @dragover.prevent
      >
        <div
          v-for="(item, index) in sortedPinnedItems"
          :key="item.id"
          :class="getItemClass(item)"
          class="relative toolbar-item-wrapper"
          @dragover="handleDragOver($event, item, true)"
          @dragenter="handleDragEnter($event, item)"
          @dragleave="handleDragLeave($event)"
          @drop="handleDrop($event, item, index, true)"
        >
          <button
            :class="[
              'p-2 rounded-lg transition-all duration-200 ease-in-out',
              activePlugin.id === item.id
                ? 'bg-primary-600 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-primary-700',
              getButtonClass(item)
            ]"
            @click="$emit('select-plugin', item.id)"
            :title="item.label"
            :draggable="true"
            @dragstart="handleDragStart($event, item)"
            @dragend="handleDragEnd($event)"
          >
            <component :is="item.icon" :size="24" />
          </button>
          <div :class="['drop-indicator', getDropIndicatorStyle(item)]" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Plugin } from '@/core/types';
import { computed, toRef } from 'vue';
import WindowControls from './WindowControls.vue';
import { useToolbarDragDrop } from '@/core/composables/useToolbarDragDrop';

const emit = defineEmits<{
  (e: 'select-plugin', id: string): void;
  (e: 'reorder-plugins', pluginId: string, targetIndex: number, isPinnedSection: boolean): void;
}>();

const props = defineProps<{
  activePlugin: Plugin;
  plugins: Plugin[];
  pluginOrder?: string[];
  pinnedPluginOrder?: string[];
}>();

const pluginsRef = toRef(props, 'plugins');

// Sort plugins by custom order
const sortedPluginItems = computed(() => {
  const items = props.plugins.filter((item) => !item.isPinned);
  if (!props.pluginOrder) return items;
  
  return [...items].sort((a, b) => {
    const aIndex = props.pluginOrder!.indexOf(a.id);
    const bIndex = props.pluginOrder!.indexOf(b.id);
    
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    
    return aIndex - bIndex;
  });
});

const sortedPinnedItems = computed(() => {
  const items = props.plugins.filter((item) => item.isPinned);
  if (!props.pinnedPluginOrder) return items;
  
  return [...items].sort((a, b) => {
    const aIndex = props.pinnedPluginOrder!.indexOf(a.id);
    const bIndex = props.pinnedPluginOrder!.indexOf(b.id);
    
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    
    return aIndex - bIndex;
  });
});

const isMac = computed(() => {
  return navigator.platform.toLowerCase().includes('mac');
});

// Setup drag and drop
const {
  handleDragStart,
  handleDragOver,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  handleDragEnd,
  getItemClass,
  getButtonClass,
  getDropIndicatorStyle
} = useToolbarDragDrop({
  plugins: pluginsRef,
  onReorder: (pluginId: string, targetIndex: number, isPinnedSection: boolean) => {
    emit('reorder-plugins', pluginId, targetIndex, isPinnedSection);
  }
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

/* Drag and drop styles */
.toolbar-item {
  position: relative;
}

.toolbar-item.dragging {
  opacity: 0.4;
}

.toolbar-item-wrapper {
  position: relative;
  /* Extend the drop zone to cover gaps between items */
  margin-top: -10px;
  padding-top: 10px;
  margin-bottom: -10px;
  padding-bottom: 10px;
}

/* Ensure the first item doesn't have negative margin at top */
.toolbar-item-wrapper:first-child {
  margin-top: 0;
}

/* Ensure the last item doesn't have negative margin at bottom */
.toolbar-item-wrapper:last-child {
  margin-bottom: 0;
}

/* Debug: Uncomment to visualize the extended drop zones */
/* .toolbar-item-wrapper {
  background: rgba(255, 0, 0, 0.1);
  border: 1px dashed rgba(255, 0, 0, 0.3);
} */

.drop-indicator {
  position: absolute;
  pointer-events: none;
  z-index: 100;
  display: none;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 4px;
}

.drop-indicator.drop-indicator-before,
.drop-indicator.drop-indicator-after {
  display: block !important;
  background: linear-gradient(90deg, 
    rgba(59, 130, 246, 0.3),
    rgba(59, 130, 246, 1) 30%,
    rgba(96, 165, 250, 1) 50%,
    rgba(59, 130, 246, 1) 70%,
    rgba(59, 130, 246, 0.3)
  );
  border-radius: 2px;
  box-shadow: 
    0 0 20px rgba(59, 130, 246, 1),
    0 0 40px rgba(59, 130, 246, 0.8),
    0 0 60px rgba(59, 130, 246, 0.6),
    inset 0 0 8px rgba(255, 255, 255, 0.6);
  animation: indicatorGlow 1.5s ease-in-out infinite;
}

.drop-indicator.drop-indicator-before {
  top: -12px;
}

.drop-indicator.drop-indicator-after {
  bottom: -12px;
}

@keyframes indicatorGlow {
  0%, 100% {
    opacity: 1;
    transform: translateX(-50%) scaleX(1);
    filter: brightness(1);
  }
  50% {
    opacity: 0.9;
    transform: translateX(-50%) scaleX(1.1);
    filter: brightness(1.2);
  }
}

/* Visual feedback for drop zones */
button.drop-zone-before {
  position: relative;
}

button.drop-zone-before::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(to bottom, rgba(59, 130, 246, 0.2), transparent);
  border-radius: 8px 8px 0 0;
  pointer-events: none;
  z-index: 1;
}

button.drop-zone-after {
  position: relative;
}

button.drop-zone-after::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(to top, rgba(59, 130, 246, 0.2), transparent);
  border-radius: 0 0 8px 8px;
  pointer-events: none;
  z-index: 1;
}

/* Ensure the icon stays above the overlay */
button.drop-zone-before > *,
button.drop-zone-after > * {
  position: relative;
  z-index: 2;
}

/* Cursor feedback during drag */
.toolbar-item:has(button[draggable="true"]) {
  cursor: move;
}

.toolbar-item.dragging button {
  cursor: grabbing !important;
}
</style> 