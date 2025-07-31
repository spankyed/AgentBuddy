<template>
  <div
    class="relative flex items-center px-4 py-2 text-sm transition-colors cursor-pointer group"
    :class="[
      isActive 
        ? 'bg-neutral-850 text-white border-t border-blue-500' 
        : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200'
    ]"
    @click="$emit('select')"
  >
    <span class="pr-2">{{ tab.label }}</span>
    <button
      v-if="!isPinned"
      class="opacity-0 group-hover:opacity-100 transition-opacity ml-1 p-0.5 rounded hover:bg-neutral-700"
      @click.stop="$emit('close')"
    >
      <X :size="14" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import type { Tab } from '@app/api';

defineProps<{
  tab: Tab;
  isActive: boolean;
  isPinned: boolean;
}>();

defineEmits<{
  select: [];
  close: [];
}>();
</script>