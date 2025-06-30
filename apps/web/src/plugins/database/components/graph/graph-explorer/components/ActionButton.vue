<template>
  <button
    :disabled="disabled"
    :class="[
      'p-1.5 text-neutral-400 hover:text-neutral-100 dark:text-gray-400 dark:hover:text-gray-100',
      'hover:bg-neutral-800 dark:hover:bg-gray-700 rounded transition-colors',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      active && 'bg-neutral-800 dark:bg-gray-700 text-neutral-100 dark:text-gray-100'
    ]"
    :title="title"
    @click="$emit('click')"
  >
    <component :is="iconComponent" class="w-4 h-4" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Download, Maximize, Minimize2 } from 'lucide-vue-next';

interface Props {
  icon: 'download' | 'maximize' | 'minimize';
  title: string;
  disabled?: boolean;
  active?: boolean;
}

const props = defineProps<Props>();

defineEmits<{
  click: [];
}>();

const iconComponent = computed(() => {
  const icons = {
    download: Download,
    maximize: props.active ? Minimize2 : Maximize,
    minimize: Minimize2,
  };
  return icons[props.icon] || Download;
});
</script> 