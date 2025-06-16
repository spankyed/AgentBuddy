<template>
  <div class="flex items-center gap-1 p-1 bg-gray-100 rounded-lg dark:bg-gray-800">
    <button
      v-for="mode in modes"
      :key="mode.value"
      @click="$emit('update:activeMode', mode.value)"
      :class="[
        'px-3 py-1 text-xs font-medium rounded transition-all',
        activeMode === mode.value
          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
      ]"
    >
      {{ mode.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
const modes = [
  { value: 'query' as const, label: 'Query' },
  { value: 'examples' as const, label: 'Examples' }
];

defineProps<{
  activeMode: 'query' | 'examples';
}>();

defineEmits<{
  'update:activeMode': [mode: 'query' | 'examples'];
}>();
</script> 