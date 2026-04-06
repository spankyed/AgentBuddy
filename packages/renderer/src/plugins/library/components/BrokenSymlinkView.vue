<template>
  <div class="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
    <div class="w-12 h-12 rounded-full bg-amber-900/30 flex items-center justify-center">
      <Link2Off class="w-6 h-6 text-amber-500" />
    </div>

    <div class="space-y-1">
      <h3 class="text-sm font-medium text-neutral-200">Linked folder is no longer accessible</h3>
      <p class="text-xs text-neutral-500">The target directory may have been renamed, moved, or deleted.</p>
    </div>

    <div v-if="lastKnownPath" class="px-3 py-2 rounded-md bg-neutral-800/50 border border-neutral-700/50 max-w-md">
      <p class="text-xs text-neutral-500 mb-1">Last known path</p>
      <code class="text-xs text-neutral-400 break-all">{{ lastKnownPath }}</code>
    </div>

    <div class="flex items-center gap-2 mt-2">
      <button
        @click="handleRelink"
        class="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
      >
        Re-link to folder
      </button>
      <button
        @click="emit('remove')"
        class="px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
      >
        Remove
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Link2Off } from 'lucide-vue-next'

const props = defineProps<{
  lastKnownPath: string | null
  collectionId: string | null
}>()

const emit = defineEmits<{
  relink: [{ collectionId: string; newPath: string }]
  remove: []
}>()

async function handleRelink() {
  if (!props.collectionId) return
  if (!window.electronAPI?.fileUtils.selectDirectory) return
  try {
    const dir = await window.electronAPI.fileUtils.selectDirectory()
    if (dir) {
      emit('relink', { collectionId: props.collectionId, newPath: dir })
    }
  } catch {
    // User cancelled
  }
}
</script>
