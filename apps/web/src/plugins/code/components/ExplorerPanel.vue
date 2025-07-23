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
    <DirectoryBreadcrumb
      :root-directory="rootDirectory"
      :current-directory="currentDirectory"
      @navigate="$emit('navigate-to-directory', $event)"
      @set-root="$emit('set-root-directory', $event)"
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
        @click="$emit('file-click', file)"
        @rename="(oldPath, newName) => $emit('rename-file', oldPath, newName)"
        @delete="confirmDelete"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Dialog from '@/core/design/dialog.vue'
import FileItem from './FileItem.vue'
import DirectoryBreadcrumb from './DirectoryBreadcrumb.vue'

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
  files: FileItem[]
  isLoading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'navigate-to-directory': [path: string]
  'set-root-directory': [path: string]
  'file-click': [file: FileItem]
  'rename-file': [oldPath: string, newName: string]
  'delete-file': [path: string]
}>()

// Delete functionality
const showDeleteDialog = ref(false)
const fileToDelete = ref<FileItem | null>(null)

const confirmDelete = (file: FileItem) => {
  fileToDelete.value = file
  showDeleteDialog.value = true
}

const handleDelete = () => {
  if (fileToDelete.value) {
    emit('delete-file', fileToDelete.value.path)
    showDeleteDialog.value = false
    fileToDelete.value = null
  }
}

const cancelDelete = () => {
  showDeleteDialog.value = false
  fileToDelete.value = null
}
</script>