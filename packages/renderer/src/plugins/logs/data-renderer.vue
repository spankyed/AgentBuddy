<template>
  <div class="relative">
    <!-- Action buttons container -->
    <div v-if="depth === 0" class="absolute top-0 right-0 flex items-center gap-1 z-10">
      <!-- Expand button for objects and arrays -->
      <button
        v-if="!isPrimitive(data) && !hideExpand"
        @click.stop="openJsonViewer"
        class="flex items-center gap-1 text-xs transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
        :class="compact ? 'p-1' : 'px-2 py-1'"
        title="View in modal"
      >
        <Maximize2 :size="12" />
        <span v-if="!compact">Expand</span>
      </button>

      <!-- Copy button with better styling from logs canvas -->
      <button
        @click.stop="copyToClipboard"
        class="flex items-center gap-1 text-xs transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
        :class="compact ? 'p-1' : 'px-2 py-1'"
        :title="copied ? 'Copied!' : 'Copy to clipboard'"
      >
        <component
          :is="copied ? Check : Copy"
          :size="12"
          :class="copied ? 'text-green-400' : ''"
        />
        <span v-if="!compact">{{ copied ? 'Copied' : 'Copy' }}</span>
      </button>
    </div>
    
    <!-- Scrollable container that respects parent width but allows content to expand -->
    <div class="overflow-x-auto max-w-full">
      <div class="font-mono text-xs w-max">
        <!-- Primitive values -->
        <div v-if="isPrimitive(data)" class="inline-flex items-center gap-1.5">
          <span class="text-[10px] tracking-wider uppercase text-neutral-600 flex-shrink-0">{{ getType(data) }}</span>
          <span :class="getPrimitiveClass(data)" class="whitespace-nowrap">{{ formatPrimitive(data) }}</span>
        </div>
        
        <!-- Arrays -->
        <div v-else-if="Array.isArray(data)" class="inline-block">
          <button 
            @click="toggleExpanded" 
            class="inline-flex items-center gap-1 px-1 py-0.5 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-all flex-shrink-0"
          >
            <ChevronRight :class="['transition-transform duration-200', expanded && 'rotate-90']" :size="10" />
            <span class="text-blue-400">Array</span>
            <span class="text-neutral-500">[{{ data.length }}]</span>
          </button>
          <Transition name="expand">
            <div v-if="expanded" class="mt-1">
              <div v-for="(item, index) in data" :key="index" class="flex items-start gap-1.5 ml-4 my-0.5">
                <span class="text-neutral-600 text-[10px] min-w-[16px] text-right flex-shrink-0">{{ index }}</span>
                <div class="min-w-0">
                  <DataRenderer :data="item" :depth="depth + 1" />
                </div>
              </div>
            </div>
          </Transition>
        </div>
        
        <!-- Objects -->
        <div v-else-if="isObject(data)" class="inline-block">
          <button 
            @click="toggleExpanded" 
            class="inline-flex items-center gap-1 px-1 py-0.5 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-all flex-shrink-0"
          >
            <ChevronRight :class="['transition-transform duration-200', expanded && 'rotate-90']" :size="10" />
            <span class="text-purple-400">Object</span>
            <span class="text-neutral-500" v-if="Object.keys(data).length > 0">
              ({{ Object.keys(data).length }})
            </span>
          </button>
          <Transition name="expand">
            <div v-if="expanded" class="mt-1">
              <div v-for="[key, value] in Object.entries(data)" :key="key" class="flex items-start gap-1.5 ml-4 my-0.5">
                <span class="text-purple-400 flex-shrink-0 whitespace-nowrap">{{ key }}:</span>
                <div class="min-w-0">
                  <DataRenderer :data="value" :depth="depth + 1" />
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- JSON Viewer Dialog -->
    <JsonViewerDialog
      v-if="depth === 0 && !isPrimitive(data) && !hideExpand"
      v-model="showJsonViewer"
      :data="data"
      :title="getViewerTitle()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, withDefaults } from 'vue';
import { ChevronRight, Copy, Check, Maximize2 } from 'lucide-vue-next';
import JsonViewerDialog from './components/json-viewer-dialog.vue';

const props = withDefaults(defineProps<{
  data: any;
  defaultExpanded?: boolean;
  depth?: number;
  compact?: boolean;
  hideExpand?: boolean;
}>(), {
  depth: 0,
  compact: false,
  hideExpand: false
});

// Initialize expanded state
// If defaultExpanded is explicitly set, use it
// Otherwise, expand if we're at the root level (depth is 0)
// const expanded = ref(
//   props.defaultExpanded !== undefined 
//     ? props.defaultExpanded 
//     : props.depth === 0
// );
const expanded = ref(true);

// Track copied state
const copied = ref(false);

// Track JSON viewer dialog state
const showJsonViewer = ref(false);

const toggleExpanded = () => {
  expanded.value = !expanded.value;
};

const isPrimitive = (value: any): boolean => {
  return value === null || 
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';
};

const isObject = (value: any): boolean => {
  return value !== null && 
    typeof value === 'object' && 
    !Array.isArray(value);
};

const getType = (value: any): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return typeof value;
};

const formatPrimitive = (value: any): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
};

const getPrimitiveClass = (value: any): string => {
  if (value === null || value === undefined) return 'text-neutral-500 italic';
  if (typeof value === 'string') return 'text-green-400';
  if (typeof value === 'number') return 'text-orange-400';
  if (typeof value === 'boolean') return 'text-cyan-400';
  return 'text-neutral-200';
};

const copyToClipboard = async () => {
  try {
    const jsonString = JSON.stringify(props.data, null, 2);
    await navigator.clipboard.writeText(jsonString);

    // Set copied state
    copied.value = true;

    // Reset after 2 seconds
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = JSON.stringify(props.data, null, 2);
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);

    // Still show copied state
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }
};

const openJsonViewer = () => {
  showJsonViewer.value = true;
};

const getViewerTitle = () => {
  if (Array.isArray(props.data)) {
    return `Array [${props.data.length}]`;
  } else if (isObject(props.data)) {
    const keys = Object.keys(props.data).length;
    return `Object (${keys} ${keys === 1 ? 'property' : 'properties'})`;
  }
  return 'JSON Viewer';
};
</script>

<style scoped>
/* Vue Transitions */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.15s ease-out;
  transform-origin: top;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: scaleY(0.95) translateY(-2px);
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  transform: scaleY(1) translateY(0);
}
</style> 