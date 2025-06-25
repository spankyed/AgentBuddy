<template>
  <div class="font-mono text-sm">
    <div v-if="isPrimitive(data)" class="inline-flex items-center gap-2">
      <span class="text-sm tracking-wider uppercase text-neutral-500">{{ getType(data) }}</span>
      <span :class="getPrimitiveClass(data)">{{ formatPrimitive(data) }}</span>
    </div>
    
    <div v-else-if="Array.isArray(data)" class="my-0.5">
      <div class="mb-1">
        <button @click="toggleExpanded" class="inline-flex items-center gap-1 px-1.5 py-0.5 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors">
          <ChevronRight :class="['transition-transform', expanded && 'rotate-90']" :size="12" />
          <span class="text-blue-400">Array</span>[{{ data.length }}]
        </button>
      </div>
      <Transition name="expand">
        <div v-if="expanded" class="pl-3 ml-4 border-l border-neutral-700">
          <div v-for="(item, index) in data" :key="index" class="flex items-start gap-2 my-1">
            <span class="text-neutral-500 min-w-[20px]">{{ index }}:</span>
            <DataRenderer :data="item" />
          </div>
        </div>
      </Transition>
    </div>
    
    <div v-else-if="isObject(data)" class="my-0.5">
      <div class="mb-1">
        <button @click="toggleExpanded" class="inline-flex items-center gap-1 px-1.5 py-0.5 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors">
          <ChevronRight :class="['transition-transform', expanded && 'rotate-90']" :size="12" />
          <span class="text-purple-400">{{ getObjectPreview(data) }}</span>
        </button>
      </div>
      <Transition name="expand">
        <div v-if="expanded" class="pl-3 ml-4 border-l border-neutral-700">
          <div v-for="[key, value] in Object.entries(data)" :key="key" class="flex items-start gap-2 my-1">
            <span class="text-purple-400 min-w-fit">{{ key }}:</span>
            <DataRenderer :data="value" />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ChevronRight } from 'lucide-vue-next';

const props = defineProps<{
  data: any;
  defaultExpanded?: boolean;
}>();

const expanded = ref(props.defaultExpanded ?? false);

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

const getObjectPreview = (obj: any): string => {
  const keys = Object.keys(obj);
  const preview = keys.slice(0, 3).join(', ');
  const suffix = keys.length > 3 ? ', ...' : '';
  return `{ ${preview}${suffix} }`;
};

const getPrimitiveClass = (value: any): string => {
  if (value === null || value === undefined) return 'text-neutral-500 opacity-60';
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
  transition: all 0.2s ease;
  transform-origin: top;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: scaleY(0.8);
}
</style> 