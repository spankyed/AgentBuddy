<template>
  <!-- Agent Canvas Content -->
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
</template>

<script setup lang="ts">
import { Copy, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { CanvasContent } from '../helpers/types'
import { ref } from 'vue'
import { applicationActor } from '@/application'
import { useSelector } from '@xstate/vue'
import { id } from '@/plugins/agent/state.ts';

const actor = applicationActor.system.get(id);
const content: CanvasContent = useSelector(actor, (state) => state.context.canvasContent)
</script>

<style lang="scss" module>
</style> 