<template>
  <div class="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center">
    <FolderOpen class="w-5 h-5 text-neutral-500" />
    <p class="text-sm text-neutral-400">No directory selected</p>
    <button
      @click="handleDirectorySelect"
      class="mt-1 px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
    >
      Select a Directory
    </button>
  </div>
</template>

<script setup lang="ts">
import { FolderOpen } from 'lucide-vue-next'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'

const codeActor: CodeState = applicationState.system.get(codeId)
const explorerActor = codeActor.system.get('explorer')!

const handleDirectorySelect = async () => {
  try {
    const directoryPath = await window.electronAPI?.fileUtils.selectDirectory()
    if (directoryPath) {
      explorerActor?.send({ type: 'explorer.SET_BASE_DIRECTORY', path: directoryPath })
    }
  } catch (error) {
    console.error('Error selecting directory:', error)
  }
}
</script>
