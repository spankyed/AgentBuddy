<template>
  <div class="flex flex-col h-full border-l w-96 bg-neutral-900 border-neutral-800">
    <div class="flex items-center justify-between p-4 border-b border-neutral-800">
      <button 
        @click="isPlugin = !isPlugin"
        class="flex items-center gap-1 px-2 py-1 text-xs tracking-wider uppercase transition-colors rounded-lg hover:bg-neutral-700 text-neutral-500 hover:text-white"
      >
        <ChevronLeft :size="14" />
        {{ isPlugin ? 'Plugin' : 'Context Inspection' }}
        <ChevronRight :size="14" />
      </button>
      <button 
        v-if="onClose"
        @click="onClose"
        class="text-neutral-500 hover:text-neutral-200"
      >
        <X :size="18" />
      </button>
    </div>
    
    <div class="flex-grow p-4 overflow-y-auto">
      <ContextItem 
        v-for="item in items" 
        :key="item.id" 
        :item="item" 
      />
    </div>
  </div>
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

<style scoped>
/* Add any component-specific styles here */
</style> 