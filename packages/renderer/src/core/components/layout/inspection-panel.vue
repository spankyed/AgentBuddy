<template>
  <div class="relative flex flex-col h-full min-w-0 border-l bg-neutral-900 border-neutral-800">
    <!-- Header for window dragging (absolutely positioned) -->
    <div class="absolute top-0 left-0 right-0 h-[57px] z-10"
      :class="{ 'inspection-header': !isAnyMenuOpen }"
    >
      <!-- Empty header for dragging -->
    </div>
    
    <!-- <div class="flex items-center p-4 border-b border-neutral-800">
      <button
        @click="$emit('panel-back')"
        class="flex gap-1 px-2 py-1 text-xs tracking-wider uppercase transition-colors rounded-lg items hover:bg-neutral-700 text-neutral-500 hover:text-white"
      >
        <ChevronLeft :size="18" />
        Back
      </button>

      <button 
        @click="$emit('panel-toggle')"
        class="flex items-center gap-1 px-2 py-1 ml-auto text-xs tracking-wider uppercase transition-colors rounded-lg hover:bg-neutral-700 text-neutral-500 hover:text-white"
      >
        <ChevronLeft :size="14" />
        {{ label }}
        <ChevronRight :size="14" />
      </button>
    </div> -->
    
    <div class="flex-grow overflow-y-auto overflow-x-hidden">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { isAnyMenuOpen } from '@/core/composables/useMenuState';

interface Props {
  label: string
}

defineProps<Props>();
defineEmits<(e: 'panel-toggle' | 'panel-back') => void>();
</script>

<style lang="scss" module>

</style>

<style lang="scss">
/* Make header draggable for window movement */
.inspection-header {
  -webkit-app-region: drag;
  user-select: none;
  pointer-events: none; /* Allow clicks to pass through to content below */
}
</style> 