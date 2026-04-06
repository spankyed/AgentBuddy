<template>
  <div class="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center h-full bg-neutral-900">
    <div class="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center">
      <FileX class="w-6 h-6 text-red-400" />
    </div>

    <div class="space-y-1">
      <h3 class="text-sm font-medium text-neutral-200">File has been deleted</h3>
      <p class="text-xs text-neutral-500">This file no longer exists on disk.</p>
    </div>

    <div v-if="filePath" class="px-3 py-2 rounded-md bg-neutral-800/50 border border-neutral-700/50 max-w-md">
      <p class="text-xs text-neutral-500 mb-1">Path</p>
      <code class="text-xs text-neutral-400 break-all">{{ filePath }}</code>
    </div>

    <button
      @click="emit('close')"
      class="mt-2 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
    >
      Close tab
    </button>
  </div>
</template>

<script setup lang="ts">
import { FileX } from 'lucide-vue-next'

defineProps<{
  filePath: string
}>()

const emit = defineEmits<{
  close: []
}>()
</script>
