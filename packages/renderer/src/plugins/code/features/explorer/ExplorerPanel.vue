<template>
  <div class="@container flex flex-col h-full">
    <!-- Header -->
    <CodePanelHeader
      :icon="FolderOpen"
      title="Explorer"
    >
      <template #actions>
        <button
          v-if="baseDirectory"
          @click="handleCreateNewFolder()"
          class="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
          title="Create new folder"
        >
          <FolderPlus :size="16" />
        </button>
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

    <!-- Files view -->
    <template v-if="baseDirectory">
      <!-- Error alert banner -->
      <div v-if="showError" class="flex items-center gap-2 px-3 py-1.5 bg-red-950/60 border-b border-red-900/50 text-red-300 text-xs">
        <AlertCircle :size="14" class="shrink-0" />
        <span class="flex-1 truncate">{{ error }}</span>
        <button
          @click="dismissedError = error"
          class="shrink-0 p-0.5 rounded hover:bg-red-900/50 text-red-400 hover:text-red-200 transition-colors"
        >
          <X :size="14" />
        </button>
      </div>

      <div v-if="isLoading && rootFiles.length === 0" class="flex items-center justify-center flex-1">
        <div class="text-sm text-neutral-400">Loading...</div>
      </div>

      <div v-else-if="rootFiles.length === 0" class="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center">
        <FolderOpen class="w-5 h-5 text-neutral-500" />
        <p class="text-sm text-neutral-400">Directory is empty</p>
        <p class="text-xs text-neutral-500">This folder contains no files</p>
      </div>

      <div
        v-else-if="rootFiles.length > 0"
        ref="treeContainerRef"
        class="flex-1 overflow-auto focus:outline-none"
        @click="handleEmptySpaceClick"
        @dragover.prevent="onEmptySpaceDragOver"
        @drop="onEmptySpaceDrop"
        @keydown="handleKeydown"
        tabindex="0"
      >
        <ExplorerTreeItem
          v-for="file in rootFiles"
          :key="file.path"
          :file="file"
          :depth="0"
        />
      </div>
    </template>

    <!-- Show empty state when no directory selected -->
    <div v-else class="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div class="flex flex-col items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-neutral-800/80 flex items-center justify-center">
          <FolderOpen class="w-5 h-5 text-neutral-500" />
        </div>
        <div>
          <p class="text-sm text-neutral-400">No directory selected</p>
          <p class="text-xs text-neutral-600 mt-0.5">Browse files or open a project</p>
        </div>
        <button
          @click="handleDirectorySelect"
          class="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors font-medium"
        >
          Select a Directory
        </button>
      </div>

      <!-- Project quick-open -->
      <div v-if="allProjects.length > 0" class="mt-6 w-full max-w-[200px]">
        <div class="flex items-center gap-2 mb-2">
          <div class="flex-1 h-px bg-neutral-800" />
          <span class="text-[10px] uppercase tracking-wider text-neutral-600 font-medium">Projects</span>
          <div class="flex-1 h-px bg-neutral-800" />
        </div>
        <div class="flex flex-col gap-0.5">
          <button
            v-for="{ project } in allProjects"
            :key="project.name"
            @click="handleProjectOpen(project.directories[0])"
            class="flex items-center gap-2.5 px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 rounded-md transition-colors text-left group"
          >
            <div
              class="w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-transparent group-hover:ring-current/10 transition-all"
              :style="{ backgroundColor: project.color }"
            />
            {{ project.name }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, nextTick } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import Dialog from '@/core/components/design/dialog.vue'
import ExplorerTreeItem from '@/plugins/code/features/explorer/ExplorerTreeItem.vue'
import CodePanelHeader from '@/plugins/code/features/CodePanelHeader.vue'
import { FolderOpen, FolderPlus, AlertCircle, X } from 'lucide-vue-next'
import { useExplorerSelection } from './composables/useExplorerSelection'
import { useExplorerDragDrop } from './composables/useExplorerDragDrop'
import { useProjectActions } from './composables/useProjectActions'
import type { FileInfo } from './state'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const explorerActor = codeActor.system.get('explorer')!
const terminalActor = codeActor.system.get('terminal')!

// State selectors
const baseDirectory = useSelector(codeActor, (state) => state.context.baseDirectory)
const { allProjects } = useProjectActions()
const rootFiles = useSelector(explorerActor, (state: any) => state.context.rootFiles as FileInfo[])
const expandedDirs = useSelector(explorerActor, (state: any) => state.context.expandedDirs as Set<string>)
const dirContents = useSelector(explorerActor, (state: any) => state.context.dirContents as Record<string, FileInfo[]>)
const loadingDirs = useSelector(explorerActor, (state: any) => state.context.loadingDirs as Set<string>)
const selectedPaths = useSelector(explorerActor, (state: any) => state.context.selectedPaths as string[])
const revealPath = useSelector(explorerActor, (state: any) => state.context.revealPath as string | null)
const isLoading = useSelector(codeActor, (state: any) => state.context.isLoading)
const error = useSelector(codeActor, (state: any) => state.context.error)

// Error dismissal
const dismissedError = ref<string | null>(null)
const showError = computed(() => !!error.value && error.value !== dismissedError.value)

// Delete functionality
const showDeleteDialog = ref(false)
const fileToDelete = ref<FileInfo | null>(null)

// Local ref for inline rename — set when creating a folder, consumed by the tree item on mount
const pendingRenamePath = ref<string | null>(null)

// Rename trigger — set by Enter key, consumed by the matching tree item
const renameTriggerPath = ref<string | null>(null)

// Container ref for restoring focus after rename
const treeContainerRef = ref<HTMLElement | null>(null)

// Build flattened visible paths for shift-range selection
function getFlattenedVisiblePaths(): string[] {
  const paths: string[] = []
  function walk(files: FileInfo[]) {
    for (const file of files) {
      paths.push(file.path)
      if (file.type === 'directory' && expandedDirs.value.has(file.path)) {
        const children = dirContents.value[file.path] || []
        walk(children)
      }
    }
  }
  walk(rootFiles.value)
  return paths
}

// Selection composable
const { selectItem, clearSelection, toggleSelectAll } = useExplorerSelection({
  selectedPaths,
  onSelect: (paths: string[]) => {
    explorerActor?.send({ type: 'explorer.SELECT_ITEMS', paths })
  }
})

// Drag-drop composable
const {
  isDragging,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDropOnEmptySpace,
  handleDragEnd,
  getItemDragClass,
  getDropIndicatorStyle
} = useExplorerDragDrop({
  selectedPaths,
  onMove: (sourcePaths, targetDir) => {
    explorerActor?.send({ type: 'explorer.MOVE_ITEMS', sourcePaths, targetDir })
  }
})

// Provide callbacks to tree items via inject
provide('explorer-select-item', (path: string, event: MouseEvent) => {
  const flatPaths = getFlattenedVisiblePaths()
  selectItem(path, flatPaths, event)
})
provide('explorer-expand-dir', (path: string) => {
  explorerActor?.send({ type: 'explorer.EXPAND_DIRECTORY', path })
})
provide('explorer-collapse-dir', (path: string) => {
  explorerActor?.send({ type: 'explorer.COLLAPSE_DIRECTORY', path })
})
provide('explorer-open-file', (path: string) => {
  explorerActor?.send({ type: 'explorer.OPEN_FILE', path })
})
provide('explorer-rename', (oldPath: string, newName: string) => {
  const pathParts = oldPath.split('/')
  pathParts[pathParts.length - 1] = newName
  const newPath = pathParts.join('/')
  explorerActor?.send({ type: 'explorer.RENAME_FILE', oldPath, newPath })
})
provide('explorer-delete', (file: FileInfo) => {
  fileToDelete.value = file
  showDeleteDialog.value = true
})
provide('explorer-open-terminal', (path: string) => {
  terminalActor?.send({ type: 'terminal.CREATE', cwd: path })
})
provide('explorer-search-in-folder', (path: string) => {
  codeActor.send({ type: 'SEARCH_IN_FOLDER', folder: path })
})
provide('explorer-selected-paths', () => selectedPaths.value)
provide('explorer-expanded-dirs', () => expandedDirs.value)
provide('explorer-dir-contents', () => dirContents.value)
provide('explorer-loading-dirs', () => loadingDirs.value)
provide('explorer-base-directory', () => baseDirectory.value || '')
provide('explorer-check-auto-rename', (itemPath: string): boolean => {
  if (pendingRenamePath.value === itemPath) {
    pendingRenamePath.value = null
    return true
  }
  return false
})
provide('explorer-rename-trigger', {
  get: () => renameTriggerPath.value,
  clear: () => { renameTriggerPath.value = null }
})
provide('explorer-reveal-path', () => revealPath.value)
provide('explorer-clear-reveal', () => {
  explorerActor?.send({ type: 'explorer.CLEAR_REVEAL' })
})

provide('explorer-restore-focus', () => {
  nextTick(() => treeContainerRef.value?.focus())
})

// Drag-drop provides
provide('explorer-drag-start', (e: DragEvent, path: string) => handleDragStart(e, path))
provide('explorer-drag-over', (e: DragEvent, path: string, isDirectory: boolean) => handleDragOver(e, path, isDirectory))
provide('explorer-drag-leave', (e: DragEvent) => handleDragLeave(e))
provide('explorer-drop', (e: DragEvent, path: string, isDirectory: boolean) => handleDrop(e, path, isDirectory))
provide('explorer-drag-end', () => handleDragEnd())
provide('explorer-get-drag-class', (path: string) => getItemDragClass(path))
provide('explorer-get-drop-indicator', (path: string) => getDropIndicatorStyle(path))

// Event handlers
const confirmDelete = (file: FileInfo) => {
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

const handleProjectOpen = (path: string) => {
  explorerActor?.send({ type: 'explorer.SET_BASE_DIRECTORY', path })
}

const handleCreateNewFolder = () => {
  // Determine target directory: first selected directory, or baseDirectory
  let targetDir = baseDirectory.value
  if (selectedPaths.value.length > 0) {
    const allFiles = [...rootFiles.value]
    for (const contents of Object.values(dirContents.value)) {
      allFiles.push(...contents)
    }
    for (const path of selectedPaths.value) {
      const file = allFiles.find(f => f.path === path)
      if (file?.type === 'directory') {
        targetDir = file.path
        break
      }
    }
  }

  if (!targetDir) return

  // Generate unique name by checking existing contents
  const existingFiles = targetDir === baseDirectory.value
    ? rootFiles.value
    : (dirContents.value[targetDir] || [])
  const existingNames = new Set(existingFiles.map(f => f.name))

  let folderName = 'New Folder'
  if (existingNames.has(folderName)) {
    let counter = 2
    while (existingNames.has(`New Folder (${counter})`)) {
      counter++
    }
    folderName = `New Folder (${counter})`
  }

  const newPath = `${targetDir}/${folderName}`
  pendingRenamePath.value = newPath
  explorerActor?.send({ type: 'explorer.CREATE_DIRECTORY', path: newPath })
}

const handleEmptySpaceClick = (e: MouseEvent) => {
  // Only clear if clicking on the empty space, not on a tree item
  const target = e.target as HTMLElement
  if (!target.closest('[data-explorer-item]')) {
    clearSelection()
  }
}

const onEmptySpaceDragOver = (e: DragEvent) => {
  if (isDragging.value) {
    e.dataTransfer!.dropEffect = 'move'
  }
}

const onEmptySpaceDrop = (e: DragEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('[data-explorer-item]') && baseDirectory.value) {
    handleDropOnEmptySpace(e, baseDirectory.value)
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  // Ctrl+A select all
  if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
    e.preventDefault()
    const allPaths = getFlattenedVisiblePaths()
    toggleSelectAll(allPaths)
    return
  }

  // Delete/Backspace to delete selected
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPaths.value.length > 0) {
    e.preventDefault()
    // Delete first selected item (show confirmation)
    const allFiles = [...rootFiles.value]
    for (const contents of Object.values(dirContents.value)) {
      allFiles.push(...contents)
    }
    const file = allFiles.find(f => f.path === selectedPaths.value[0])
    if (file) {
      confirmDelete(file)
    }
    return
  }

  // Enter to rename selected item
  if (e.key === 'Enter' && selectedPaths.value.length === 1) {
    e.preventDefault()
    renameTriggerPath.value = selectedPaths.value[0]
    return
  }

  // Escape to clear selection
  if (e.key === 'Escape') {
    clearSelection()
  }

  // ArrowRight to expand, ArrowLeft to collapse
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    const selected = selectedPaths.value[selectedPaths.value.length - 1]
    if (selected == null) return

    const allFiles = [...rootFiles.value]
    for (const contents of Object.values(dirContents.value)) {
      allFiles.push(...contents)
    }
    const file = allFiles.find(f => f.path === selected)
    if (!file || file.type !== 'directory') return

    if (e.key === 'ArrowRight' && !expandedDirs.value.has(selected)) {
      explorerActor?.send({ type: 'explorer.EXPAND_DIRECTORY', path: selected })
    } else if (e.key === 'ArrowLeft' && expandedDirs.value.has(selected)) {
      explorerActor?.send({ type: 'explorer.COLLAPSE_DIRECTORY', path: selected })
    }
    return
  }

  // Arrow keys to navigate
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const paths = getFlattenedVisiblePaths()
    if (paths.length === 0) return

    const lastSelected = selectedPaths.value[selectedPaths.value.length - 1]
    const currentIndex = lastSelected != null
      ? paths.indexOf(lastSelected)
      : -1

    let nextIndex: number
    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, paths.length - 1)
    } else {
      nextIndex = currentIndex === -1 ? paths.length - 1 : Math.max(currentIndex - 1, 0)
    }

    explorerActor?.send({ type: 'explorer.SELECT_ITEMS', paths: [paths[nextIndex]] })
  }
}
</script>
