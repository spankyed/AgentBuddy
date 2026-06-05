<template>
  <TrackedContextMenuRoot>
    <ContextMenuTrigger as-child>
      <div
        ref="itemEl"
        data-explorer-item
        class="flex items-center gap-1 py-0.5 transition-colors cursor-pointer select-none relative"
        :class="[
          isSelected ? 'bg-blue-500/30' : 'hover:bg-neutral-800',
          dragClass
        ]"
        :draggable="!isEditing"
        @click="handleClick"
        @dblclick="handleDoubleClick"
        @dragstart="onDragStart"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        @dragend="onDragEnd"
      >
        <!-- Drop indicator -->
        <div
          v-if="showDropIndicator"
          :style="dropIndicatorStyle"
        />

        <div class="flex items-center gap-1 min-w-0 flex-1 ml-1" :style="{ paddingLeft: `${depth * 16 + 8}px`, paddingRight: '8px' }">
          <!-- Expand/collapse arrow for directories -->
          <button
            v-if="file.type === 'directory'"
            @click.stop="toggleExpand"
            class="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-transform duration-150 flex-shrink-0"
            :class="{ 'rotate-90': isExpanded }"
          >
            <ChevronRight class="w-3 h-3" />
          </button>
          <div v-else class="w-4 flex-shrink-0" />

          <!-- File/folder icon -->
          <component
            :is="icon"
            class="flex-shrink-0 w-4 h-4"
            :class="file.type === 'directory' ? 'text-blue-400' : 'text-neutral-400'"
          />

          <!-- Name or rename input -->
          <input
            v-if="isEditing"
            v-model="editingName"
            @keydown.enter.stop="confirmRename"
            @keydown.esc.stop="cancelRename"
            @blur="confirmRename"
            @click.stop
            class="flex-1 px-1 py-0 -mx-1 text-sm border rounded bg-neutral-900 border-neutral-600 text-neutral-200 focus:outline-none focus:border-blue-500 focus:bg-neutral-800 min-w-0"
            ref="renameInput"
          />
          <span v-else class="text-sm truncate text-neutral-200">{{ file.name }}</span>
        </div>
      </div>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent
        class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
      >
        <ContextMenuItem
          @select="startRename"
          :class="MENU_ITEM_CLASS"
        >
          <Edit2 class="w-4 h-4" />
          Rename
        </ContextMenuItem>

        <ContextMenuItem
          @select="copyAbsolutePath"
          :class="MENU_ITEM_CLASS"
        >
          <Copy class="w-4 h-4" />
          Copy path
        </ContextMenuItem>

        <ContextMenuItem
          @select="copyRelativePath"
          :class="MENU_ITEM_CLASS"
        >
          <Copy class="w-4 h-4" />
          Copy relative path
        </ContextMenuItem>

        <ContextMenuItem
          @select="openInFinder"
          :class="MENU_ITEM_CLASS"
        >
          <FolderOpen class="w-4 h-4" />
          Open in Finder
        </ContextMenuItem>

        <ContextMenuItem
          v-if="isVideo"
          @select="openInVideoPlayer"
          :class="MENU_ITEM_CLASS"
        >
          <Play class="w-4 h-4" />
          Open in Video Player
        </ContextMenuItem>

        <ContextMenuItem
          v-if="file.type !== 'directory' && file.extension === 'md'"
          @select="openFile(file.path, getMdEditorDefault() ? 'plainText' : 'richText')"
          :class="MENU_ITEM_CLASS"
        >
          <FileText class="w-4 h-4" />
          {{ getMdEditorDefault() ? 'Open as Plain Text' : 'Open as Rich Text' }}
        </ContextMenuItem>

        <ContextMenuItem
          v-if="file.type === 'directory'"
          @select="openTerminalHere"
          :class="MENU_ITEM_CLASS"
        >
          <Terminal class="w-4 h-4" />
          Open Terminal Here
        </ContextMenuItem>

        <ContextMenuItem
          v-if="file.type === 'directory'"
          @select="searchInFolder"
          :class="MENU_ITEM_CLASS"
        >
          <Search class="w-4 h-4" />
          Search Folder
        </ContextMenuItem>

        <ContextMenuItem
          v-if="file.type === 'directory'"
          @select="createFolderIn(file.path)"
          :class="MENU_ITEM_CLASS"
        >
          <FolderPlus class="w-4 h-4" />
          New Folder
        </ContextMenuItem>

        <!-- Project menu items - only for directories -->
        <template v-if="file.type === 'directory'">
          <ContextMenuSeparator :class="MENU_SEPARATOR_CLASS" />

          <ContextMenuItem @select="() => createProject(file.path)" :class="MENU_ITEM_CLASS">
            <FolderPlus class="w-4 h-4" />
            New Project
          </ContextMenuItem>

          <ContextMenuSub v-if="allProjects.length > 0">
            <ContextMenuSubTrigger :class="MENU_ITEM_CLASS">
              <Folder class="w-4 h-4" />
              <span class="flex-1">Add to Project</span>
              <ChevronRight class="w-3 h-3 text-neutral-500" />
            </ContextMenuSubTrigger>
            <ContextMenuPortal>
              <ContextMenuSubContent class="w-fit max-h-[300px] overflow-auto bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50" :side-offset="4">
                <ContextMenuCheckboxItem
                  v-for="({ project, pIndex }) in allProjects"
                  :key="`${pIndex}`"
                  :model-value="isDirectoryInProject(project.directories, file.path)"
                  @select="() => { if (!isDirectoryInProject(project.directories, file.path)) addDirectoryToProject(file.path, pIndex) }"
                  :class="MENU_ITEM_CLASS"
                >
                  <ContextMenuItemIndicator class="flex items-center justify-center w-4 h-4">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </ContextMenuItemIndicator>
                  <div class="flex items-center gap-2">
                    <span
                      class="w-2 h-2 rounded-full flex-shrink-0"
                      :style="{ backgroundColor: project.color }"
                    ></span>
                    <span class="truncate">{{ project.name }}</span>
                  </div>
                </ContextMenuCheckboxItem>
              </ContextMenuSubContent>
            </ContextMenuPortal>
          </ContextMenuSub>

          <ContextMenuItem
            v-if="allProjects.length === 0"
            disabled
            :class="MENU_DISABLED_CLASS"
          >
            No projects available
          </ContextMenuItem>

          <ContextMenuItem @select="navigateToProjects" :class="MENU_ITEM_CLASS">
            <Settings class="w-4 h-4" />
            Manage Projects
          </ContextMenuItem>
        </template>

        <ContextMenuSeparator :class="MENU_SEPARATOR_CLASS" />

        <ContextMenuItem
          @select="deleteItem"
          :class="MENU_ITEM_DANGER_CLASS"
        >
          <Trash2 class="w-4 h-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </TrackedContextMenuRoot>

  <!-- Loading indicator for expanding directory -->
  <div v-if="file.type === 'directory' && isExpanded && isLoading">
    <div class="flex items-center gap-2 py-1" :style="{ paddingLeft: `${(depth + 1) * 16 + 12}px` }">
      <div class="w-3.5 h-3.5 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin" />
      <span class="text-xs text-neutral-500">Loading...</span>
    </div>
  </div>

  <!-- Recursively render children -->
  <template v-if="file.type === 'directory' && isExpanded && !isLoading">
    <ExplorerTreeItem
      v-for="child in children"
      :key="child.path"
      :file="child"
      :depth="depth + 1"
    />
  </template>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, inject, onMounted } from 'vue'
import {
  Folder,
  ChevronRight,
  Edit2,
  Trash2,
  Copy,
  Terminal,
  Search,
  FileText,
  FolderOpen,
  FolderPlus,
  Settings,
  Play,
} from 'lucide-vue-next'
import {
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
  ContextMenuItemIndicator,
} from 'reka-ui'
import { useProjectActions } from './composables/useProjectActions'
import { MENU_ITEM_CLASS, MENU_ITEM_DANGER_CLASS, MENU_SEPARATOR_CLASS, MENU_DISABLED_CLASS } from './constants'
import { getFileIcon, videoExtensions } from '../../utils/file-icons'
import TrackedContextMenuRoot from '@/core/components/design/TrackedContextMenuRoot.vue'
import type { FileInfo } from './state'

const props = defineProps<{
  file: FileInfo
  depth: number
}>()

// Project actions
const {
  allProjects,
  isDirectoryInProject,
  addDirectoryToProject,
  createProject,
  navigateToProjects
} = useProjectActions()

// Injected callbacks from ExplorerPanel
const selectItem = inject<(path: string, event: MouseEvent) => void>('explorer-select-item')!
const expandDir = inject<(path: string) => void>('explorer-expand-dir')!
const collapseDir = inject<(path: string) => void>('explorer-collapse-dir')!
const openFile = inject<(path: string, editorMode?: 'richText' | 'plainText') => void>('explorer-open-file')!
const getMdEditorDefault = inject<() => boolean>('explorer-md-editor-default')!
const onRename = inject<(oldPath: string, newName: string) => void>('explorer-rename')!
const onDelete = inject<(file: FileInfo) => void>('explorer-delete')!
const onOpenTerminal = inject<(path: string) => void>('explorer-open-terminal')!
const onSearchInFolder = inject<(path: string) => void>('explorer-search-in-folder')!
const getSelectedPaths = inject<() => string[]>('explorer-selected-paths')!
const getExpandedDirs = inject<() => Set<string>>('explorer-expanded-dirs')!
const getDirContents = inject<() => Record<string, FileInfo[]>>('explorer-dir-contents')!
const getLoadingDirs = inject<() => Set<string>>('explorer-loading-dirs')!
const getBaseDirectory = inject<() => string>('explorer-base-directory')!
const checkAutoRename = inject<(path: string) => boolean>('explorer-check-auto-rename')!
const getRevealPath = inject<() => string | null>('explorer-reveal-path')!
const clearReveal = inject<() => void>('explorer-clear-reveal')!
const renameTrigger = inject<{ get: () => string | null, clear: () => void }>('explorer-rename-trigger')!
const createFolderIn = inject<(path: string) => void>('explorer-create-folder-in')!
const promotePreview = inject<(path: string) => void>('explorer-promote-preview')!
const restoreFocus = inject<() => void>('explorer-restore-focus')!

// Drag-drop injections
const dragStart = inject<(e: DragEvent, path: string) => void>('explorer-drag-start')!
const dragOver = inject<(e: DragEvent, path: string, isDirectory: boolean) => void>('explorer-drag-over')!
const dragLeave = inject<(e: DragEvent) => void>('explorer-drag-leave')!
const drop = inject<(e: DragEvent, path: string, isDirectory: boolean) => void>('explorer-drop')!
const dragEnd = inject<() => void>('explorer-drag-end')!
const getItemDragClass = inject<(path: string) => string>('explorer-get-drag-class')!
const getDropIndicatorStyle = inject<(path: string) => Record<string, string>>('explorer-get-drop-indicator')!

// Editing state
const isEditing = ref(false)
const editingName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const itemEl = ref<HTMLElement | null>(null)

const isSelected = computed(() => getSelectedPaths().includes(props.file.path))
const isExpanded = computed(() => getExpandedDirs().has(props.file.path))
const isLoading = computed(() => getLoadingDirs().has(props.file.path))
const dragClass = computed(() => getItemDragClass(props.file.path))
const dropIndicatorStyle = computed(() => getDropIndicatorStyle(props.file.path))
const showDropIndicator = computed(() => {
  const style = dropIndicatorStyle.value
  return style.display !== 'none'
})

const children = computed(() => {
  if (props.file.type !== 'directory') return []
  return getDirContents()[props.file.path] || []
})

// Icon based on file type/extension
const icon = computed(() => {
  if (props.file.type === 'directory') return Folder
  return getFileIcon(props.file.extension)
})

const isVideo = computed(() =>
  props.file.type === 'file' && videoExtensions.includes(props.file.extension?.toLowerCase() || '')
)

function openInVideoPlayer() {
  window.electronAPI?.shell.openPath(props.file.path)
}

// Focus input when editing starts
watch(isEditing, async (editing) => {
  if (editing) {
    await nextTick()
    renameInput.value?.focus()
    renameInput.value?.select()
  }
})

// Watch for rename trigger from Enter key
watch(() => renameTrigger.get(), (path) => {
  if (path === props.file.path) {
    renameTrigger.clear()
    startRename()
  }
})

// Auto-enter rename mode for newly created folders
onMounted(async () => {
  if (checkAutoRename(props.file.path)) {
    startRename()
  }

  // Scroll into view if this item is the reveal target
  if (getRevealPath() === props.file.path) {
    await nextTick()
    itemEl.value?.scrollIntoView({ block: 'nearest' })
    clearReveal()
  }
})

function toggleExpand() {
  if (isExpanded.value) {
    collapseDir(props.file.path)
  } else {
    expandDir(props.file.path)
  }
}

function handleClick(event: MouseEvent) {
  if (isEditing.value) return
  selectItem(props.file.path, event)
  if (props.file.type !== 'directory' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
    openFile(props.file.path)
  }
}

function handleDoubleClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (props.file.type === 'directory') {
    toggleExpand()
  } else {
    promotePreview(props.file.path)
  }
}

function startRename() {
  setTimeout(() => {
    editingName.value = props.file.name
    isEditing.value = true
  }, 50)
}

function confirmRename() {
  const trimmedName = editingName.value.trim()
  if (trimmedName && trimmedName !== props.file.name) {
    onRename(props.file.path, trimmedName)
  }
  cancelRename()
}

function cancelRename() {
  isEditing.value = false
  editingName.value = ''
  restoreFocus()
}

function deleteItem() {
  onDelete(props.file)
}

function openTerminalHere() {
  onOpenTerminal(props.file.path)
}

function searchInFolder() {
  onSearchInFolder(props.file.path)
}

async function copyAbsolutePath() {
  try {
    await navigator.clipboard.writeText(props.file.path)
  } catch (err) {
    console.error('Failed to copy path:', err)
  }
}

function openInFinder() {
  window.electronAPI?.shell.showItemInFolder(props.file.path)
}

async function copyRelativePath() {
  try {
    const base = getBaseDirectory()
    let relativePath = props.file.path
    if (base && relativePath.startsWith(base)) {
      relativePath = relativePath.slice(base.length)
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1)
      }
    }
    await navigator.clipboard.writeText(relativePath)
  } catch (err) {
    console.error('Failed to copy relative path:', err)
  }
}

// Drag-drop handlers
function onDragStart(e: DragEvent) {
  dragStart(e, props.file.path)
}

function onDragOver(e: DragEvent) {
  dragOver(e, props.file.path, props.file.type === 'directory')
}

function onDragLeave(e: DragEvent) {
  dragLeave(e)
}

function onDrop(e: DragEvent) {
  drop(e, props.file.path, props.file.type === 'directory')
}

function onDragEnd() {
  dragEnd()
}
</script>
