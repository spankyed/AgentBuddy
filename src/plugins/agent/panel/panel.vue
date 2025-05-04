<template>
  <!-- Agent Panel Content -->
  <!-- <ContextItem 
    v-for="item in items" 
    :key="item.id" 
    :item="item" 
  /> -->
  <h2 class="text-sm font-medium text-neutral-200">No Context</h2>
</template>

<script setup lang="ts">
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import ContextItem from './item.vue'
import type { ContextItem as ContextItemType } from '../types'
import { ref } from 'vue'

interface ContextPanelProps {
  items: ContextItemType[]
  onClose?: () => void
}

defineProps<ContextPanelProps>()
const isPlugin = ref(false)
</script>

<style lang="scss" module>
/* Add any component-specific styles here */
</style> 