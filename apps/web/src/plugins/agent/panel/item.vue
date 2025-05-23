<template>
  <div class="mb-3 overflow-hidden border rounded-lg shadow-sm bg-neutral-800 border-neutral-800">
    <div 
      class="flex items-center justify-between px-4 py-3 cursor-pointer"
      @click="isExpanded = !isExpanded"
    >
      <h3 class="text-sm font-medium">{{ item.title }}</h3>
      <button class="text-neutral-500">
        <component :is="isExpanded ? ChevronUp : ChevronDown" :size="16" />
      </button>
    </div>
    
    <div v-if="isExpanded" class="p-4 border-t border-neutral-800 animate-slide-down">
      <template v-if="item.itemType === 'code'">
        <div class="relative">
          <pre class="p-3 overflow-x-auto font-mono text-xs text-white rounded bg-neutral-900">
            <code>{{ item.content }}</code>
          </pre>
          <button 
            class="absolute p-1 transition-colors rounded top-2 right-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white"
            title="Copy to clipboard"
          >
            <Copy :size="14" />
          </button>
        </div>
      </template>
      
      <template v-else>
        <p class="text-sm text-neutral-200">{{ item.content }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronUp, Copy } from 'lucide-vue-next'
import type { ContextItemEntity  } from '@abuddy/api'

interface ContextItemProps {
  item: ContextItemEntity
}

defineProps<ContextItemProps>()

const isExpanded = ref(false)
</script>

<style lang="scss" module>
/* Add any component-specific styles here */
</style> 