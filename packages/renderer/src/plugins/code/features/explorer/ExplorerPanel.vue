<template>
  <div class="@container flex flex-col h-full">
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

    <!-- Create Folder Dialog -->
    <Dialog
      v-model="showCreateFolderDialog"
      title="Create New Folder"
      description="Enter a name for the new folder"
      show-default-actions
      confirm-text="Create"
      @confirm="handleCreateFolder"
      @cancel="cancelCreateFolder"
    >
      <input
        v-model="newFolderName"
        @keydown.enter="handleCreateFolder"
        placeholder="Folder name"
        class="w-full px-3 py-2 mt-2 text-sm border rounded bg-neutral-900 border-neutral-600 text-neutral-200 focus:outline-none focus:border-blue-500"
        ref="folderNameInput"
      />
    </Dialog>

    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-3 pb-3 border-b border-neutral-800 explorer-header">
      <div class="flex items-center gap-2">
        <FolderOpen :size="16" class="text-neutral-400" />
        <div class="flex items-center gap-1.5 text-sm">
          <span
            class="font-medium transition-colors"
            :class="viewMode === 'workspaces' ? 'text-neutral-400 hover:text-neutral-200 cursor-pointer' : 'text-neutral-200'"
            @click="viewMode === 'workspaces' ? toggleViewMode() : null"
          >
            Explorer
          </span>
          <template v-if="viewMode === 'workspaces'">
            <span class="text-neutral-600">/</span>
            <span class="font-medium text-neutral-200">Workspaces</span>
          </template>
        </div>
      </div>
      <!-- Create folder button - only show when a directory is selected and in files view -->
      <button
        v-if="baseDirectory && viewMode === 'files'"
        @click="openCreateFolderDialog"
        class="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
        title="Create new folder"
      >
        <FolderPlus :size="16" />
      </button>
    </div>

    <!-- Files view -->
    <template v-if="viewMode === 'files' && baseDirectory">
      <DirectoryBreadcrumb
        :base-directory="baseDirectory"
        :active-directory="activeDirectory"
        @navigate="navigateToDirectory"
        @set-base="setBaseDirectory"
      />

      <div v-if="isLoading" class="flex items-center justify-center flex-1">
        <div class="text-sm text-neutral-400">Loading...</div>
      </div>

      <div v-else-if="error" class="flex-1 p-4">
        <div class="text-sm text-red-400">{{ error }}</div>
      </div>

      <div v-else-if="files.length === 0" class="flex-1 flex flex-col items-center justify-center p-4">
        <FolderOpen :size="48" class="text-neutral-600 mb-3" />
        <p class="text-neutral-400 text-center">This directory is empty</p>
      </div>

      <div v-else class="flex-1 overflow-auto">
        <FileItem
          v-for="file in files"
          :key="file.path"
          :file="file"
          :base-directory="baseDirectory"
          @click="handleFileClick(file)"
          @rename="handleRename"
          @delete="confirmDelete"
          @open-terminal="handleOpenTerminal"
        />
      </div>

      <!-- Action Buttons for Files View -->
      <div class="flex gap-2 p-2 border-t border-neutral-800">
        <!-- View Workspaces Button -->
        <button
          @click="toggleViewMode"
          class="flex-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center gap-2"
        >
          <Layers class="w-4 h-4" />
          <span class="@[420px]:hidden">Workspaces</span>
          <span class="hidden @[420px]:inline">View Workspaces</span>
        </button>

        <!-- Change Directory Button -->
        <button
          @click="handleDirectorySelect"
          class="flex-1 px-3 py-1.5 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors flex items-center justify-center gap-2"
        >
          <FolderOpen class="w-4 h-4" />
          <span class="@[420px]:hidden">Open</span>
          <span class="hidden @[420px]:inline">Open Directory</span>
        </button>
      </div>
    </template>

    <!-- Workspaces view -->
    <template v-else-if="viewMode === 'workspaces'">
      <WorkspaceView
        :workspaces="workspaces"
        @set-directory="handleWorkspaceDirectorySelect"
      />

      <!-- Action Buttons for Workspaces View -->
      <div class="flex gap-2 p-2 border-t border-neutral-800">
        <!-- Back to Files Button -->
        <button
          @click="toggleViewMode"
          class="flex-1 px-3 py-1.5 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors flex items-center justify-center gap-2"
        >
          <ArrowLeft class="w-4 h-4" />
          <span class="@[420px]:hidden">Back</span>
          <span class="hidden @[420px]:inline">Back to Files</span>
        </button>

        <!-- Manage Workspaces Button -->
        <button
          @click="handleAddProject"
          class="flex-1 px-3 py-1.5 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors flex items-center justify-center gap-2"
        >
          <Settings class="w-4 h-4" />
          <span class="@[420px]:hidden">Manage</span>
          <span class="hidden @[420px]:inline">Manage Workspaces</span>
        </button>
      </div>
    </template>

    <!-- Show empty state when no directory selected (Files view only) -->
    <div v-else class="flex-1 flex flex-col items-center justify-start p-4">
      <!-- <FolderOpen :size="48" class="text-neutral-600 mb-3" /> -->
      <p class="text-neutral-400 text-center mb-4">No directory selected</p>
      <button
        @click="handleDirectorySelect"
        class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
      >
        Select a Directory
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import Dialog from '@/core/components/design/dialog.vue'
import FileItem from '@/plugins/code/features/explorer/FileItem.vue'
import DirectoryBreadcrumb from '@/plugins/code/features/explorer/DirectoryBreadcrumb.vue'
import WorkspaceView from '@/plugins/code/features/explorer/WorkspaceView.vue'
import { FolderOpen, FolderPlus, Settings, Layers, ArrowLeft } from 'lucide-vue-next'

interface FileItem {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  size?: number
}

const props = defineProps<{
  baseDirectory: string | null
  activeDirectory: string | null
}>()

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const explorerActor = codeActor.system.get('explorer')!
const terminalActor = codeActor.system.get('terminal')!
const settingsActor = applicationState.system.get('settings')

// State selectors
const files = useSelector(explorerActor, (state: any) => state.context.files)
const isLoading = useSelector(codeActor, (state: any) => state.context.isLoading)
const error = useSelector(codeActor, (state: any) => state.context.error)
const workspaces = useSelector(settingsActor, (state: any) => state.context.settings?.general?.workspaces?.workspaces || [])

// View mode state
const viewMode = ref<'files' | 'workspaces'>('files')

// No emits needed - handle everything internally

// Delete functionality
const showDeleteDialog = ref(false)
const fileToDelete = ref<FileItem | null>(null)

// Create folder functionality
const showCreateFolderDialog = ref(false)
const newFolderName = ref('')
const folderNameInput = ref<HTMLInputElement | null>(null)

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

const setBaseDirectory = (path: string) => {
  explorerActor?.send({ type: 'explorer.SET_BASE_DIRECTORY', path })
}

const handleFileClick = (file: FileItem) => {
  if (file.type === 'directory') {
    explorerActor?.send({ type: 'explorer.NAVIGATE_TO_DIRECTORY', path: file.path })
  } else {
    explorerActor?.send({ type: 'explorer.OPEN_FILE', path: file.path })
  }
}

const handleDirectorySelect = async () => {
  if (!window.electronAPI?.fileUtils.selectDirectory) {
    console.error('Directory selection API not available')
    return
  }

  try {
    const directoryPath = await window.electronAPI.fileUtils.selectDirectory()

    if (directoryPath && directoryPath !== props.baseDirectory) {
      explorerActor?.send({ type: 'explorer.SET_BASE_DIRECTORY', path: directoryPath })
    }
  } catch (error) {
    console.error('Error selecting directory:', error)
  }
}

const handleAddProject = () => {
  // Navigate to Settings plugin, General tab, Workspaces section
  const settingsActor = applicationState.system.get('settings')

  // Switch to settings plugin
  applicationState.send({
    type: 'SELECT_PLUGIN',
    pluginId: 'settings'
  })

  // Navigate to General tab
  settingsActor?.send({
    type: 'SETTINGS_TAB.SELECT',
    tab: 'general'
  })

  // Navigate to Workspaces section
  settingsActor?.send({
    type: 'GENERAL_NAV.SELECT',
    item: 'workspaces'
  })
}

const handleOpenTerminal = (path: string) => {
  terminalActor?.send({ type: 'terminal.CREATE', cwd: path })
}

const openCreateFolderDialog = () => {
  newFolderName.value = ''
  showCreateFolderDialog.value = true
  // Focus input after dialog opens
  setTimeout(() => {
    folderNameInput.value?.focus()
  }, 100)
}

const handleCreateFolder = () => {
  const trimmedName = newFolderName.value.trim()
  if (trimmedName) {
    // Create the folder in the current directory
    const activeDir = props.activeDirectory || props.baseDirectory
    if (activeDir) {
      const newFolderPath = `${activeDir}/${trimmedName}`
      explorerActor?.send({ type: 'explorer.CREATE_DIRECTORY', path: newFolderPath })
    }
  }
  cancelCreateFolder()
}

const cancelCreateFolder = () => {
  showCreateFolderDialog.value = false
  newFolderName.value = ''
}

const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'files' ? 'workspaces' : 'files'
}

const handleWorkspaceDirectorySelect = (path: string) => {
  explorerActor?.send({ type: 'explorer.SET_BASE_DIRECTORY', path })
  // Switch back to files view after selecting a directory
  viewMode.value = 'files'
}
</script>

<style scoped>
/* Override window drag region to make header elements clickable - only on interactive elements, not whitespace */
.explorer-header > * {
  -webkit-app-region: no-drag;
}
</style>
