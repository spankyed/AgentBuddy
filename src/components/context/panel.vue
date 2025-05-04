<template>
  <div class="flex flex-col h-full border-l w-96 bg-neutral-900 border-neutral-800">
    <div class="flex items-center justify-between p-4 border-b border-neutral-800">
      <button 
        @click="$emit('panel-toggle')"
        class="flex items-center gap-1 px-2 py-1 text-xs tracking-wider uppercase transition-colors rounded-lg hover:bg-neutral-700 text-neutral-500 hover:text-white"
      >
        <ChevronLeft :size="14" />
        {{ label }}
        <ChevronRight :size="14" />
      </button>
    </div>
    
    <div class="flex-grow p-4 overflow-y-auto">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import ContextItem from './item.vue';
import type { ContextItem as ContextItemType } from '../../helpers/types';
import { useSelector } from '@xstate/vue';
import { applicationActor } from '../../state/application';

interface Props {
  label: string
}

defineProps<Props>();
defineEmits<(e: 'panel-toggle') => void>();
</script>

<style lang="scss" module>
</style> 