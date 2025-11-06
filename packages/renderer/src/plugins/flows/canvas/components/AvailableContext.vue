<template>
  <div class="pt-6 border-t border-neutral-800">
    <details class="group">
      <summary class="flex items-center text-xs font-semibold tracking-wider uppercase list-none cursor-pointer text-neutral-500 hover:text-neutral-400">
        <ChevronRight class="w-3 h-3 mr-2 transition-transform group-open:rotate-90" />
        Available Context
      </summary>
      <div class="p-3 mt-3 font-mono text-xs border rounded-md bg-neutral-800/30 border-neutral-700 text-neutral-500">
        <div class="space-y-2">
          <div>
            <span class="text-blue-400">$.event</span>
            <div class="ml-4">
              <div>.type <span class="text-neutral-600">// Event type</span></div>
              <div>.data <span class="text-neutral-600">// Event payload data</span></div>
              <div>.timestamp <span class="text-neutral-600">// When event occurred</span></div>
            </div>
          </div>
          <div>
            <span class="text-blue-400">$.lastStep</span>
            <div class="ml-4">
              <div>.result <span class="text-neutral-600">// Previous step output</span></div>
              <div>.id <span class="text-neutral-600">// Step ID</span></div>
              <div>.label <span class="text-neutral-600">// Step label</span></div>
            </div>
          </div>
          <div>
            <span class="text-blue-400">$.steps</span> <span class="text-neutral-600">// Array of all step results</span>
          </div>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
</script>

<style scoped>
/* Hide default details disclosure triangle */
summary::-webkit-details-marker {
  display: none;
}
</style>
