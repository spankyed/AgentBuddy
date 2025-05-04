<template>
  <div
    class="relative flex flex-col flex-grow pb-2 bg-neutral-800"
    :class="$style.component"
  >
    <div class="w-full">
      <button 
        @click="$emit('canvas-toggle')"
        class="flex items-center gap-1 px-2 py-1 mt-4 ml-3 text-xs tracking-wider uppercase transition-colors rounded-lg hover:bg-neutral-700 text-neutral-500 hover:text-white"
      >
        <ChevronLeft :size="14" />
          {{ label }}
        <ChevronRight :size="14" />
      </button>
    </div>

    <div class="w-full overflow-y-auto">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import type { CanvasContent } from '../helpers/types'
import { useSelector } from '@xstate/vue'
import { applicationActor } from '../state/application'

interface Props {
  label: string
}

defineProps<Props>()
defineEmits<(e: 'canvas-toggle') => void>()
</script>

<style lang="scss" module>
.component {
  max-height: 45vh;
}
</style> 