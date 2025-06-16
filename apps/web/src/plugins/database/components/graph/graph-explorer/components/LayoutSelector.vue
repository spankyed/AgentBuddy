<template>
  <div class="flex items-center gap-1 p-1 bg-gray-100 rounded-lg dark:bg-gray-800">
    <button
      v-for="layout in layouts"
      :key="layout.type"
      @click="handleChange(layout.type)"
      :disabled="disabled"
      :class="[
        'px-2 py-1 text-xs font-medium rounded transition-all',
        modelValue === layout.type
          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
        disabled && 'opacity-50 cursor-not-allowed'
      ]"
      :title="layout.description"
    >
      {{ layout.name }}
    </button>
  </div>
</template>

<script setup lang="ts">
export interface Layout {
  type: string;
  name: string;
  description: string;
}

interface Props {
  modelValue: string;
  layouts: readonly Layout[];
  disabled?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'change': [value: string];
}>();

function handleChange(value: string) {
  if (props.disabled) return;
  emit('update:modelValue', value);
  emit('change', value);
}
</script> 