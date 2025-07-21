<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Always use FileEditor which now handles both regular files and diffs -->
    <FileEditor
      :open-files="openFiles"
      :active-file-path="activeFilePath"
      @select-file="selectFile"
      @close-file="closeFile"
      @content-change="handleContentChange"
      class="h-full"
    />

    <!-- Status Bar -->
    <div class="flex items-center justify-between px-4 py-1 text-xs border-t bg-neutral-800/80 border-neutral-800">
      <div class="flex items-center gap-4">
        <span v-if="activeFile" class="flex items-center gap-2 text-neutral-400">
          <component :is="activeFile.isDiff ? GitCompare : FileCode" class="w-3 h-3" />
          {{ getFileName(activeFile.isDiff && activeFile.gitFile ? activeFile.gitFile.path : activeFile.path) }}
        </span>
        <span v-if="activeFile && activeFile.pendingSaveConflict && !activeFile.isDiff" class="text-orange-400">
          External changes detected
        </span>
        <span v-else-if="activeFile && activeFile.modified && !activeFile.isDiff" class="text-blue-400">
          Modified
        </span>
        <span v-if="refreshNotification" class="text-green-400 animate-pulse">
          File refreshed
        </span>
      </div>
      <div class="flex items-center gap-4">
        <button
          v-if="activeFile && activeFile.modified && !activeFile.isDiff"
          @click="() => saveFile()"
          class="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Save
        </button>
      </div>
    </div>
    
    <!-- File Override Dialog -->
    <FileOverrideDialog
      v-model="showOverrideDialog"
      :file-path="conflictFilePath"
      @override="handleOverride"
      @load-external="handleLoadExternal"
      @show-diff="handleShowDiff"
    />
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from './state'
import { trpc } from '@/core/trpc'
import { GitCompare, FileCode } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import FileEditor from './components/FileEditor.vue'
import FileOverrideDialog from './components/FileOverrideDialog.vue'

const actor: CodeState = applicationState.system.get(id)

// State selectors
const openFiles = useSelector(actor, (state) => state.context.openFiles)
const activeFilePath = useSelector(actor, (state) => state.context.activeFilePath)

// Computed
const activeFile = computed(() => 
  openFiles.value.find(f => f.path === activeFilePath.value)
)

// Dialog state
const showOverrideDialog = ref(false)
const conflictFilePath = ref('')

// Notification state
const refreshNotification = ref(false)
let refreshTimeout: number | undefined

// Watch for external file refreshes
watch(openFiles, (newFiles, oldFiles) => {
  if (!oldFiles || !newFiles) return
  
  // Check if any file was refreshed (externallyModified cleared)
  for (const newFile of newFiles) {
    const oldFile = oldFiles.find(f => f.path === newFile.path)
    if (oldFile && oldFile.externallyModified && !newFile.externallyModified && !newFile.modified) {
      // File was refreshed
      showRefreshNotification()
      break
    }
  }
}, { deep: true })

const showRefreshNotification = () => {
  refreshNotification.value = true
  if (refreshTimeout) {
    clearTimeout(refreshTimeout)
  }
  refreshTimeout = window.setTimeout(() => {
    refreshNotification.value = false
  }, 3000)
}

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

const saveFile = async (force = false) => {
  if (activeFile.value && !activeFile.value.isDiff) {
    // Check for external modification conflict
    if (!force && activeFile.value.pendingSaveConflict) {
      conflictFilePath.value = activeFile.value.path
      showOverrideDialog.value = true
      return
    }
    
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'WRITE_FILE' as any,
      path: activeFile.value.path, 
      content: activeFile.value.content
    } as any)
  }
}

// Dialog handlers
const handleOverride = () => {
  saveFile(true)
}

const handleLoadExternal = () => {
  if (conflictFilePath.value) {
    // Reload the file from disk
    trpc.bus.send.mutate({
      systemId: id as any,
      type: 'READ_FILE' as any,
      path: conflictFilePath.value
    } as any)
  }
}

const handleShowDiff = () => {
  // TODO: Implement diff view between current and external version
  console.log('Show diff not yet implemented')
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
    if (activeFile.value && activeFile.value.modified && !activeFile.value.isDiff) {
      saveFile()
    }
  }
  
  // Close tab: Cmd/Ctrl + W
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
    e.preventDefault()
    if (activeFilePath.value) {
      closeFile(activeFilePath.value)
    }
  }
}

// Add keyboard event listener
window.addEventListener('keydown', handleKeyDown)

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (refreshTimeout) {
    clearTimeout(refreshTimeout)
  }
})
</script>

<style>
.bg-neutral-850 {
  background-color: rgb(28, 28, 30);
}
</style>