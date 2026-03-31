<template>
  <div class="relative group flex items-center gap-2.5 w-[240px] bg-neutral-900 border border-neutral-700 rounded-lg p-2">
    <div class="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-neutral-800 flex items-center justify-center">
      <img v-if="file.isImage && file.previewUrl" :src="file.previewUrl" class="w-full h-full object-cover border border-neutral-700/50" />
      <FileIcon v-else :size="20" class="text-neutral-400" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-sm text-neutral-200 truncate">{{ file.name }}</div>
      <div class="text-xs text-neutral-500">{{ file.typeLabel }}</div>
    </div>
    <button v-if="removable" type="button" @click="$emit('remove')"
      class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-neutral-900/80 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors opacity-0 group-hover:opacity-100">
      <X :size="10" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { File as FileIcon, X } from 'lucide-vue-next'
import type { FileReference } from '@app/api'

withDefaults(defineProps<{
  file: FileReference
  removable?: boolean
}>(), {
  removable: false,
})

defineEmits<{
  (e: 'remove'): void
}>()
</script>
