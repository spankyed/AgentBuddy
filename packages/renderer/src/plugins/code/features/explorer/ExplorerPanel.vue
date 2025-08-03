<template>
  <div class="flex flex-col h-full">
    <!-- Delete Confirmation Dialog -->
    <Dialog
      v-model="showDeleteDialog"
      :title="`Delete ${fileToDelete?.type === 'directory' ? 'Directory' : 'File'}`"
      :description="`Are you sure you want to delete '${fileToDelete?.name}'? This action cannot be undone.`"
      show-default-actions
      confirm-text="Delete"
      @confirm="handleDelete"
      @cancel="cancelDelete"
    />
    
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
      <div class="flex items-center gap-2">
        <FolderOpen :size="16" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200">Explorer</h3>
      </div>
    </div>
    
    <DirectoryBreadcrumb
      :root-directory="rootDirectory"
      :current-directory="currentDirectory"
      @navigate="navigateToDirectory"
      @set-root="setRootDirectory"
    />
    
    <div v-if="isLoading" class="flex items-center justify-center flex-1">
      <div class="text-sm text-neutral-400">Loading...</div>
    </div>
    
    <div v-else-if="error" class="flex-1 p-4">
      <div class="text-sm text-red-400">{{ error }}</div>
    </div>
    
    <div v-else class="flex-1 overflow-auto">
      <FileItem
        v-for="file in files"
        :key="file.path"
        :file="file"
        :root-directory="rootDirectory"
        @click="handleFileClick(file)"
        @rename="handleRename"
        @delete="confirmDelete"
      />
    </div>
    
    <!-- Change Directory Button -->
    <div class="p-2 border-t border-neutral-800">
      <button
        @click="triggerDirectorySelect"
        class="w-full px-3 py-1.5 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors"
      >
        Change Directory
      </button>
      <!-- Hidden file input for directory selection -->
      <input
        ref="directoryInput"
        type="file"
        webkitdirectory
        directory
        multiple
        @change="handleDirectorySelect"
        class="hidden"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import Dialog from '@/core/design/dialog.vue'
import FileItem from '@/plugins/code/features/explorer/FileItem.vue'
import DirectoryBreadcrumb from '@/plugins/code/features/explorer/DirectoryBreadcrumb.vue'
import { FolderOpen } from 'lucide-vue-next'

interface FileItem {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  size?: number
}

const props = defineProps<{
  rootDirectory: string | null
  currentDirectory: string | null
}>()

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const explorerActor = codeActor.system.get('explorer')!

// State selectors
const files = useSelector(explorerActor, (state: any) => state.context.files)
const isLoading = useSelector(explorerActor, (state: any) => state.context.isLoading)
const error = useSelector(explorerActor, (state: any) => state.context.error)

// No emits needed - handle everything internally

// Delete functionality
const showDeleteDialog = ref(false)
const fileToDelete = ref<FileItem | null>(null)

const confirmDelete = (file: FileItem) => {
  fileToDelete.value = file
  showDeleteDialog.value = true
}

const handleDelete = () => {
  if (fileToDelete.value) {
    explorerActor?.send({ type: 'explorer.DELETE_FILE', path: fileToDelete.value.path })
    showDeleteDialog.value = false
    fileToDelete.value = null
  }
}

const cancelDelete = () => {
  showDeleteDialog.value = false
  fileToDelete.value = null
}

const handleRename = (oldPath: string, newName: string) => {
  // Construct the new path
  const pathParts = oldPath.split('/')
  pathParts[pathParts.length - 1] = newName
  const newPath = pathParts.join('/')
  
  // Send rename event directly to explorer state machine
  explorerActor?.send({ type: 'explorer.RENAME_FILE', oldPath, newPath })
}

// Navigation handlers
const navigateToDirectory = (path: string) => {
  explorerActor?.send({ type: 'explorer.NAVIGATE_TO_DIRECTORY', path })
}

const setRootDirectory = (path: string) => {
  explorerActor?.send({ type: 'explorer.SET_ROOT_DIRECTORY', path })
}

const handleFileClick = (file: FileItem) => {
  if (file.type === 'directory') {
    explorerActor?.send({ type: 'explorer.NAVIGATE_TO_DIRECTORY', path: file.path })
  } else {
    explorerActor?.send({ type: 'explorer.OPEN_FILE', path: file.path })
  }
}

// Directory selection refs
const directoryInput = ref<HTMLInputElement | null>(null)

const triggerDirectorySelect = () => {
  directoryInput.value?.click()
}

const handleDirectorySelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input.files
  
  if (files && files.length > 0 && window.electronAPI?.fileUtils) {
    // When using webkitdirectory, files contains all files in the selected directory
    // Get the path of the first file to determine the selected directory
    const firstFilePath = window.electronAPI.fileUtils.getPathForFile(files[0])
    
    // Extract the directory path from the file path
    const lastSlashIndex = firstFilePath.lastIndexOf('/')
    const directoryPath = firstFilePath.substring(0, lastSlashIndex)
    
    if (directoryPath && directoryPath !== props.rootDirectory) {
      explorerActor?.send({ type: 'explorer.SET_ROOT_DIRECTORY', path: directoryPath })
    }
    
    // Clear the input value to allow selecting the same directory again
    input.value = ''
  }
}
</script>