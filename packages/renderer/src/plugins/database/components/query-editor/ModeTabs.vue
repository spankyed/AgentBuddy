<template>
  <div class="flex items-center rounded-md border border-neutral-700 overflow-hidden">
    <button
      v-for="(mode, i) in modes"
      :key="mode.value"
      @click="$emit('update:activeMode', mode.value)"
      :class="[
        'px-3 py-1 text-xs font-medium transition-colors',
        i > 0 ? 'border-l border-neutral-700' : '',
        activeMode === mode.value
          ? 'bg-neutral-700 text-neutral-100'
          : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
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
