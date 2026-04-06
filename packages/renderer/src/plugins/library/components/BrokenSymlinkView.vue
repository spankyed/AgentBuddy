<template>
  <div class="flex items-center justify-center h-full p-8">
    <div class="w-full max-w-sm rounded-lg border border-neutral-700/60 bg-neutral-800/40 overflow-hidden">
      <!-- Header -->
      <div class="px-4 pt-4 pb-3 flex items-start gap-3">
        <div class="mt-0.5 w-8 h-8 shrink-0 rounded-full bg-amber-500/10 flex items-center justify-center">
          <Link2Off class="w-4 h-4 text-amber-500" />
        </div>
        <div class="min-w-0">
          <h3 class="text-sm font-medium text-neutral-200 leading-tight">Linked folder is no longer accessible</h3>
          <p class="text-xs text-neutral-500 mt-0.5">The target may have been renamed, moved, or deleted.</p>
        </div>
      </div>

      <!-- Last known path -->
      <div v-if="lastKnownPath" class="mx-4 px-3 py-2 rounded-md bg-neutral-900/50 border border-neutral-700/40">
        <p class="text-[11px] text-neutral-500 uppercase tracking-wider mb-0.5">Last known path</p>
        <code class="text-xs text-neutral-400 break-all leading-relaxed">{{ lastKnownPath }}</code>
      </div>

      <!-- Re-link input -->
      <div class="p-4 flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <input
            v-model="relinkPath"
            type="text"
            class="flex-1 min-w-0 px-2.5 py-1.5 text-sm border rounded-md bg-neutral-900/60 border-neutral-700 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500/70"
            placeholder="Enter directory path"
            @keydown.enter="confirmRelink"
            @keydown.escape="relinkPath = ''"
          />
          <Button @click="browseRelinkPath" variant="transparent" size="sm">Browse</Button>
        </div>
        <div class="flex items-center justify-end gap-3">
          <button
            @click="emit('remove')"
            class="text-xs text-neutral-500 hover:text-red-400 transition-colors"
          >
            Remove link
          </button>
          <Button @click="confirmRelink" variant="primary" size="sm" :disabled="!relinkPath.trim()">Re-link</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Link2Off } from 'lucide-vue-next'
import Button from '@/core/components/design/button.vue'

const props = defineProps<{
  lastKnownPath: string | null
  collectionId: string | null
}>()

const emit = defineEmits<{
  relink: [{ collectionId: string; newPath: string }]
  remove: []
}>()

const relinkPath = ref('')

async function browseRelinkPath() {
  if (!window.electronAPI?.fileUtils.selectDirectory) return
  try {
    const dir = await window.electronAPI.fileUtils.selectDirectory()
    if (dir) {
      relinkPath.value = dir
      confirmRelink()
    }
  } catch {
    // User cancelled
  }
}

function confirmRelink() {
  const path = relinkPath.value.trim()
  if (!path || !props.collectionId) return
  emit('relink', { collectionId: props.collectionId, newPath: path })
  relinkPath.value = ''
}
</script>
