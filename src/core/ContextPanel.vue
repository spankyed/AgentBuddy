<template>
  <div class="flex flex-col h-full border-l w-96 bg-neutral-900 border-neutral-800">
    <div class="flex items-center justify-between p-4 border-b border-neutral-800">
      <h2 class="font-medium text-primary-800">Context Inspection</h2>
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
import { X } from 'lucide-vue-next'
import ContextItem from './ContextItem.vue'
import type { ContextItem as ContextItemType } from './types'

interface ContextPanelProps {
  items: ContextItemType[]
  onClose?: () => void
}

defineProps<ContextPanelProps>()
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 