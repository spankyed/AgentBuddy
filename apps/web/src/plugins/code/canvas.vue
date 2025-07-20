<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Show diff viewer when viewing git changes from commit panel -->
    <DiffViewer
      v-if="selectedGitFile && selectedPanel === 'commit'"
      :selected-git-file="selectedGitFile"
      :git-diff="gitDiff"
      class="h-full"
    />
    <!-- Show file editor for normal file editing -->
    <FileEditor
      v-else
      :open-files="openFiles"
      :active-file-path="activeFilePath"
      @select-file="selectFile"
      @close-file="closeFile"
      @content-change="handleContentChange"
      class="h-full"
    />

    <!-- Status Bar -->
    <div class="flex items-center justify-between px-4 py-1 text-xs border-t bg-neutral-850 border-neutral-800">
      <div class="flex items-center gap-4">
        <span v-if="selectedGitFile && selectedPanel === 'commit'" class="text-neutral-400 flex items-center gap-2">
          <GitCompare class="w-3 h-3" />
          {{ getFileName(selectedGitFile.path) }}
        </span>
        <span v-else-if="activeFile" class="text-neutral-400">
          {{ getFileName(activeFile.path) }}
        </span>
        <span v-if="activeFile && activeFile.modified && !selectedGitFile" class="text-blue-400">
          Modified
        </span>
      </div>
      <div class="flex items-center gap-4">
        <button
          v-if="selectedGitFile && selectedPanel === 'commit'"
          @click="closeDiff"
          class="px-2 py-0.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors"
        >
          Close Diff
        </button>
        <button
          v-else-if="activeFile && activeFile.modified"
          @click="saveFile"
          class="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from './state'
import { trpc } from '@/core/trpc'
import { GitCompare } from 'lucide-vue-next'
import { computed, onUnmounted } from 'vue'
import FileEditor from './components/FileEditor.vue'
import DiffViewer from './components/DiffViewer.vue'

const actor: CodeState = applicationState.system.get(id)

// State selectors
const openFiles = useSelector(actor, (state) => state.context.openFiles)
const activeFilePath = useSelector(actor, (state) => state.context.activeFilePath)
const gitDiff = useSelector(actor, (state) => state.context.gitDiff)
const selectedGitFile = useSelector(actor, (state) => state.context.selectedGitFile)
const selectedPanel = useSelector(actor, (state) => state.context.selectedPanel)

// Computed
const activeFile = computed(() => 
  openFiles.value.find(f => f.path === activeFilePath.value)
)

// Event handlers
const selectFile = (path: string) => {
  actor.send({ type: 'SELECT_FILE', path })
}

const closeFile = (path: string) => {
  actor.send({ type: 'CLOSE_FILE', path })
}

const handleContentChange = (path: string, content: string) => {
  actor.send({ 
    type: 'FILE_MODIFIED', 
    path, 
    content 
  })
}

const saveFile = async () => {
  if (activeFile.value) {
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'WRITE_FILE' as any,
      path: activeFile.value.path, 
      content: activeFile.value.content
    } as any)
  }
}

const closeDiff = () => {
  actor.send({ type: 'CLEAR_GIT_DIFF' })
}

// Helper functions
const getFileName = (path: string) => {
  return path.split('/').pop() || path
}

// Keyboard shortcuts
const handleKeyDown = (e: KeyboardEvent) => {
  // Save file: Cmd/Ctrl + S
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    if (activeFile.value && activeFile.value.modified) {
      saveFile()
    }
  }
  
  // Close tab: Cmd/Ctrl + W
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
    e.preventDefault()
    if (activeFilePath.value && !(selectedGitFile.value && selectedPanel.value === 'commit')) {
      closeFile(activeFilePath.value)
    }
  }
}

// Add keyboard event listener
window.addEventListener('keydown', handleKeyDown)

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style>
.bg-neutral-850 {
  background-color: rgb(28, 28, 30);
}
</style>