<template>
  <div
    class="relative flex flex-col flex-grow bg-neutral-800 pb-2"
    :class="$style.component"
  >
    <div class="w-full">
      <button 
        @click="isPlugin = !isPlugin"
        class="ml-3 mt-4 flex items-center gap-1 px-2 py-1 text-xs tracking-wider uppercase transition-colors rounded-lg hover:bg-neutral-700 text-neutral-500 hover:text-white"
      >
        <ChevronLeft :size="14" />
        {{ isPlugin ? 'Plugin' : 'Canvas' }}
        <ChevronRight :size="14" />
      </button>
    </div>

    <div class="w-full overflow-y-auto">
      <!-- Canvas Content -->
      <div class="max-w-4xl mx-auto">
        <div class="p-6 rounded-lg shadow-md bg-neutral-800 animate-fade-in">
          <template v-if="content.type === 'code'">
            <div class="relative">
              <pre class="p-6 overflow-x-auto font-mono text-sm text-white rounded-lg bg-neutral-900">
                <code>{{ content.content }}</code>
              </pre>
              <button 
                class="absolute p-2 transition-colors rounded top-3 right-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white"
                title="Copy to clipboard"
              >
                <Copy :size="16" />
              </button>
            </div>
          </template>
          
          <template v-else-if="content.type === 'text'">
            <div class="prose">{{ content.content }}</div>
          </template>
          
          <template v-else-if="content.type === 'image'">
            <img :src="content.content" alt="Canvas content" class="h-auto max-w-full" />
          </template>
          
          <template v-else>
            <div class="py-8 text-center text-neutral-500">No content to display</div>
          </template>
        </div>
        
        <div v-if="content.type === 'code'" class="p-4 mt-4 border rounded-lg border-neutral-300 bg-neutral-800">
          <p class="text-sm italic text-neutral-300">please rewrite this code using css variables from our design systems</p>
        </div>
        <div v-if="content.type === 'code'" class="p-4 mt-4 border rounded-lg border-neutral-300 bg-neutral-800">
          <p class="text-sm italic text-neutral-300">please rewrite this code using css variables from our design systems</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Copy, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { CanvasContent } from './types'
import { ref } from 'vue'

interface CanvasAreaProps {
  content: CanvasContent
}

defineProps<CanvasAreaProps>()
const isPlugin = ref(false)
</script>

<style lang="scss" module>
.component {
  max-height: 45vh;
}

/* Add any component-specific styles here */
</style> 