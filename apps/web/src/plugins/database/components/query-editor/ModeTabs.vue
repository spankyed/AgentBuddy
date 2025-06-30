<template>
  <div class="flex items-center gap-1 p-1 rounded-lg bg-neutral-900">
    <button
      v-for="mode in modes"
      :key="mode.value"
      @click="$emit('update:activeMode', mode.value)"
      :class="[
        'px-3 py-1 text-xs font-medium rounded transition-all',
        activeMode === mode.value
          ? 'bg-neutral-700 text-neutral-100 shadow-sm'
          : 'text-neutral-400 hover:text-neutral-200'
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