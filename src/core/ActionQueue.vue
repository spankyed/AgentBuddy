<template>
  <div class="border-t border-neutral-700 bg-neutral-800">
    <div class="flex items-center justify-between p-3 border-b border-neutral-700">
      <div class="flex items-center">
        <List :size="16" class="mr-2 text-neutral-300" />
        <h3 class="text-sm font-medium text-neutral-100">Action Queue</h3>
        <div 
          v-if="activeCount > 0 || pendingCount > 0"
          class="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-primary-100 text-primary-800"
        >
          {{ activeCount }} active, {{ pendingCount }} pending
        </div>
      </div>
      
      <button 
        v-if="onClear"
        @click="onClear"
        class="flex items-center text-xs text-neutral-500 hover:text-neutral-200"
      >
        <MinusCircle :size="14" class="mr-1" />
        Clear completed
      </button>
    </div>
    
    <div class="p-3 overflow-y-auto max-h-64">
      <ActionQueueItem 
        v-for="action in actions" 
        :key="action.id" 
        :action="action" 
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { List, MinusCircle } from 'lucide-vue-next'
import ActionQueueItem from './ActionQueueItem.vue'
import type { ActionItem } from './types'

interface ActionQueueProps {
  actions: ActionItem[]
  onClear?: () => void
}

const props = defineProps<ActionQueueProps>()

const activeCount = computed(() => 
  props.actions.filter(a => a.status === 'in-progress').length
)
const pendingCount = computed(() => 
  props.actions.filter(a => a.status === 'pending').length
)
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 