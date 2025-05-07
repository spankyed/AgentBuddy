<template>
  <button
    :class="baseClasses"
    @click="$emit('toggle')"
  >
    <slot name="left-icon"></slot>
    <slot></slot>
    <slot name="right-icon"></slot>
  </button>
</template>

<script setup lang="ts">
import { defineEmits } from 'vue'

const props = defineProps<{
  active?: boolean
}>()

defineEmits<(e: 'toggle') => void>()

const baseClasses = 'flex items-center gap-1 px-2 py-1 text-xs tracking-wider uppercase transition-colors rounded-lg hover:bg-neutral-700 text-neutral-500 hover:text-white'

// Add named export
defineExpose({})
</script> 