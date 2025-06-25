<template>
  <div class="font-mono text-xs">
    <!-- Primitive values -->
    <div v-if="isPrimitive(data)" class="inline-flex items-center gap-1.5">
      <span class="text-[10px] tracking-wider uppercase text-neutral-600">{{ getType(data) }}</span>
      <span :class="getPrimitiveClass(data)">{{ formatPrimitive(data) }}</span>
    </div>
    
    <!-- Arrays -->
    <div v-else-if="Array.isArray(data)" class="inline-block">
      <button 
        @click="toggleExpanded" 
        class="inline-flex items-center gap-1 px-1 py-0.5 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-all"
      >
        <ChevronRight :class="['transition-transform duration-200', expanded && 'rotate-90']" :size="10" />
        <span class="text-blue-400">Array</span>
        <span class="text-neutral-500">[{{ data.length }}]</span>
      </button>
      <Transition name="expand">
        <div v-if="expanded" class="mt-1">
          <div v-for="(item, index) in data" :key="index" class="flex items-start gap-1.5 ml-4 my-0.5">
            <span class="text-neutral-600 text-[10px] min-w-[16px] text-right">{{ index }}</span>
            <DataRenderer :data="item" :depth="depth + 1" />
          </div>
        </div>
      </Transition>
    </div>
    
    <!-- Objects -->
    <div v-else-if="isObject(data)" class="inline-block">
      <button 
        @click="toggleExpanded" 
        class="inline-flex items-center gap-1 px-1 py-0.5 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-all"
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
            <span class="text-purple-400 shrink-0">{{ key }}:</span>
            <DataRenderer :data="value" :depth="depth + 1" />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, withDefaults } from 'vue';
import { ChevronRight } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  data: any;
  defaultExpanded?: boolean;
  depth?: number;
}>(), {
  depth: 0
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