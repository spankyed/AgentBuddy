<template>
  <button
    :class="baseClasses"
    @click="$emit('toggle')"
  >
    <ChevronLeft v-if='!hideChevrons' :size="14" />
    <slot />
    <ChevronRight v-if='!hideChevrons' :size="14" />
  </button>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  active?: boolean
  hideChevrons?: boolean
}>()

defineEmits<(e: 'toggle') => void>()

const baseClasses = 'flex items-center gap-1 px-2 py-1 text-xs tracking-wider uppercase transition-colors rounded-lg hover:bg-neutral-700 text-neutral-500 hover:text-white'
</script> 