<template>
  <div class="@container flex flex-col h-full">
    <!-- Header -->
    <CodePanelHeader
      :icon="FolderOpen"
      title="Explorer"
      :clickable="viewMode === 'projects'"
      @title-click="viewMode = 'files'"
    >
      <template #title-extra v-if="viewMode === 'projects'">
        <span class="text-neutral-600">/</span>
        <span class="font-medium text-neutral-200">Projects</span>
      </template>

      <template #actions>
        <button
          v-if="baseDirectory && viewMode === 'files'"
          @click="openCreateFolderDialog()"
          class="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
          title="Create new folder"
        >
          <FolderPlus :size="16" />
        </button>
        <button
          v-if="viewMode === 'projects'"
          @click="handleManageProjects"
          class="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
          title="Manage Projects"
        >
          <Settings :size="16" />
        </button>
      </template>

      <template #toolbar>
        <DirectoryBreadcrumb
          v-if="viewMode === 'files' && baseDirectory"
          :base-directory="baseDirectory"
          :active-directory="activeDirectory"
          @navigate="navigateToDirectory"
          @set-base="setBaseDirectory"
          @view-projects="viewMode = 'projects'"
          @open-directory="handleDirectorySelect"
        />
      </template>
    </CodePanelHeader>

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

    <!-- Files view -->
    <template v-if="viewMode === 'files' && baseDirectory">
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
    </template>

    <!-- Projects view -->
    <template v-else-if="viewMode === 'projects'">
      <ProjectsView
        :projects="projects"
        @set-directory="handleWorkspaceDirectorySelect"
        @open-terminal="handleOpenTerminal"
      />
    </template>

    <!-- Show empty state when no directory selected (Files view only) -->
    <div v-else class="flex-1 flex flex-col items-center justify-start p-4">
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
import ProjectsView from '@/plugins/code/features/explorer/ProjectsView.vue'
import CodePanelHeader from '@/plugins/code/features/CodePanelHeader.vue'
import DirectoryBreadcrumb from '@/plugins/code/features/explorer/DirectoryBreadcrumb.vue'
import { FolderOpen, FolderPlus, Settings } from 'lucide-vue-next'

interface FileItem {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  size?: number
}

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const explorerActor = codeActor.system.get('explorer')!
const terminalActor = codeActor.system.get('terminal')!
const settingsActor = applicationState.system.get('settings')

// State selectors
const baseDirectory = useSelector(codeActor, (state) => state.context.baseDirectory)
const activeDirectory = useSelector(codeActor, (state) => state.context.activeDirectory)
const files = useSelector(explorerActor, (state: any) => state.context.files)
const isLoading = useSelector(codeActor, (state: any) => state.context.isLoading)
const error = useSelector(codeActor, (state: any) => state.context.error)
const projects = useSelector(settingsActor, (state: any) => state.context.settings?.general?.projects || [])

// View mode state - local to this component
const viewMode = ref<'files' | 'projects'>('files')

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
  const pathParts = oldPath.split('/')
  pathParts[pathParts.length - 1] = newName
  const newPath = pathParts.join('/')

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

    if (directoryPath && directoryPath !== baseDirectory.value) {
      explorerActor?.send({ type: 'explorer.SET_BASE_DIRECTORY', path: directoryPath })
    }
  } catch (error) {
    console.error('Error selecting directory:', error)
  }
}

const handleOpenTerminal = (path: string) => {
  terminalActor?.send({ type: 'terminal.CREATE', cwd: path })
}

const openCreateFolderDialog = () => {
  newFolderName.value = ''
  showCreateFolderDialog.value = true
  setTimeout(() => {
    folderNameInput.value?.focus()
  }, 100)
}

const handleCreateFolder = () => {
  const trimmedName = newFolderName.value.trim()
  if (trimmedName) {
    const activeDir = activeDirectory.value || baseDirectory.value
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

const handleWorkspaceDirectorySelect = (path: string) => {
  explorerActor?.send({ type: 'explorer.SET_BASE_DIRECTORY', path })
  viewMode.value = 'files'
}

const handleManageProjects = () => {
  const settingsActorRef = applicationState.system.get('settings')

  applicationState.send({
    type: 'SELECT_PLUGIN',
    pluginId: 'settings'
  })

  settingsActorRef?.send({
    type: 'SETTINGS_TAB.SELECT',
    tab: 'general'
  })

  settingsActorRef?.send({
    type: 'GENERAL_NAV.SELECT',
    item: 'projects'
  })
}
</script>
