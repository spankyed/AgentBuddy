<template>
  <div class="flex flex-col h-full bg-neutral-900">

    <ConfirmDialog
      v-model="deleteDialog.show"
      :title="deleteDialog.isUnlink ? 'Unlink Folder' : 'Delete Item'"
      :description="deleteDialog.message"
      :confirm-text="deleteDialog.isUnlink ? 'Unlink' : 'Delete'"
      cancel-text="Cancel"
      @confirm="handleDelete"
      @cancel="deleteDialog.show = false"
    />

    <!-- Toolbar -->
    <div class="px-6 py-3 border-b border-neutral-800" @click.stop>
      <!-- Navigation Row -->
      <div class="flex items-center justify-between gap-4">
        <!-- Back Button and Breadcrumbs -->
        <div class="flex items-center gap-3">
          <!-- Back Button -->
          <button
            v-if="currentFolderId !== null"
            @click="navigateBack"
            class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-neutral-300 hover:bg-neutral-800 active:scale-95"
            aria-label="Go back"
            title="Go back"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>

          <!-- Breadcrumb Navigation -->
          <div class="flex items-center gap-1 text-sm">
            <button
              @click="navigateToFolder(null)"
              class="pr-2 py-1 transition-colors rounded-md hover:bg-neutral-800"
              :class="currentFolderId === null ? 'text-neutral-100 font-medium' : 'text-neutral-400 hover:text-neutral-300'"
            >
              root
            </button>
            <template v-if="breadcrumbs.length > 0">
              <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
                <ChevronRight class="w-4 h-4 text-neutral-600" />
                <button
                  @click="navigateToBreadcrumb(crumb)"
                  class="px-2 py-1 transition-colors rounded-md hover:bg-neutral-800"
                  :class="index === breadcrumbs.length - 1 ? 'text-neutral-100 font-medium' : 'text-neutral-400 hover:text-neutral-300'"
                >
                  {{ crumb.name }}
                </button>
              </template>
            </template>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2">
          <!-- Selection indicator and actions -->
          <template v-if="selectedItems.length > 0">
            <span class="text-sm text-neutral-400 mr-1">
              {{ selectedItems.length }} selected
            </span>
            <div class="flex items-center gap-1">
              <Button
                v-if="currentFolderId !== null && !isInSymlinkContext"
                @click="moveSelectedItemsUp"
                variant="transparent"
                size="sm"
                class="px-0.5 border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
                title="Move selected items up a level"
              >
                <ArrowUp class="w-4 h-4" />
              </Button>
              <Button
                @click="deleteSelectedItems"
                variant="transparent"
                size="sm"
                class="px-0.5 border-red-500/30 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
                title="Delete selected items"
              >
                <Trash2 class="w-4 h-4" />
              </Button>
            </div>
            <div class="w-px h-5 bg-neutral-700 ml-1" />
          </template>

          <Button
            @click="createSearchIndex"
            variant="transparent"
            size="sm"
            data-onboarding-id="library-search-index-button"
            class="border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
          >
            <Search class="w-4 h-4" />
            <span>Create Index</span>
          </Button>
          <ContextMenuRoot>
            <ContextMenuTrigger as-child>
              <Button
                @click="createFolder"
                variant="transparent"
                size="sm"
                class="border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
              >
                <FolderPlus class="w-4 h-4" />
                <span>New Folder</span>
              </Button>
            </ContextMenuTrigger>
            <ContextMenuPortal>
              <ContextMenuContent class="z-50 min-w-[160px] rounded-md border border-neutral-700 bg-neutral-800 p-1 shadow-md">
                <ContextMenuItem
                  @select="createFolder"
                  class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
                >
                  <FolderPlus class="w-4 h-4" />
                  New Folder
                </ContextMenuItem>
                <ContextMenuItem
                  @select="createSymlinkFolder"
                  class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
                >
                  <Link class="w-4 h-4" />
                  New Symlink
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenuPortal>
          </ContextMenuRoot>
          <Button @click="createDocument" variant="primary" size="sm" data-onboarding-id="library-create-button">
            <FileText class="w-4 h-4" />
            <span>{{ isInSymlinkContext ? 'New File' : 'New Document' }}</span>
          </Button>
        </div>
      </div>
    </div>

    <!-- Symlink Path Input -->
    <div v-if="symlinkInput.show" class="flex items-center gap-2 px-6 py-2 border-b border-neutral-800 max-w-lg ml-auto">
      <input
        v-model="symlinkInput.path"
        type="text"
        class="flex-1 w-96 px-3 py-1.5 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
        placeholder="Enter directory path"
        autofocus
        @keydown.enter="confirmSymlink"
        @keydown.escape="symlinkInput.show = false"
      />
      <Button @click="browseSymlinkPath" variant="transparent" size="sm">Browse</Button>
      <Button @click="confirmSymlink" variant="primary" size="sm">Create</Button>
      <button @click="symlinkInput.show = false" class="p-1 text-neutral-400 hover:text-neutral-200">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- File Table -->
    <div class="flex-1 overflow-hidden" @click="handleTableContainerClick">
      <div class="h-full overflow-y-auto overflow-x-hidden custom-scrollbar" @click="handleScrollAreaClick">
        <table class="w-full"  data-onboarding-id="library-table">
          <thead class="sticky top-0 z-10 bg-neutral-900">
            <tr class="text-xs font-medium text-left border-b text-neutral-500 border-neutral-800">
              <TableHeader @click="sort('name')" class="!pl-6 w-[54%]">Name</TableHeader>
              <TableHeader @click="sort('modified')" class="w-[16%]">Date Modified</TableHeader>
              <TableHeader @click="sort('size')" class="w-[10%]">Size</TableHeader>
              <TableHeader @click="sort('kind')" class="w-[10%]">Kind</TableHeader>
              <th class="px-6 py-2 text-right w-[10%]">Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="sortedItems.length > 0">
              <TreeTableRow
                v-for="item in sortedItems"
                :key="item.id"
                :item="item"
                :depth="0"
              />
            </template>

            <tr v-if="sortedItems.length === 0">
              <td colspan="5" class="h-64">
                <div class="flex flex-col items-center justify-center h-full text-center">
                  <FolderOpen class="w-10 h-10 mb-3 text-neutral-600" />
                  <p class="text-sm text-neutral-500">This folder is empty</p>
                </div>
              </td>
            </tr>
            <!-- Fill remaining space with empty rows (also acts as drop zone) -->
            <tr
              v-if="sortedItems.length > 0"
              v-for="n in Math.max(0, 8 - sortedItems.length)"
              :key="`empty-${n}`"
              class="empty-drop-zone"
              @click="handleEmptyRowClick"
              @dragover.prevent="handleDragOver($event, null)"
              @drop="handleDropOnEmpty($event)"
            >
              <td class="px-6 py-3">&nbsp;</td>
              <td class="px-6 py-3">&nbsp;</td>
              <td class="px-6 py-3">&nbsp;</td>
              <td class="px-6 py-3">&nbsp;</td>
              <td class="px-6 py-3">&nbsp;</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch, provide, onMounted, onUnmounted } from 'vue'
import {
  FolderPlus,
  Folder,
  FileText,
  ChevronRight,
  ChevronLeft,
  Edit2,
  Trash2,
  Search,
  ArrowUp,
  FolderOpen,
  Link,
  X,
} from 'lucide-vue-next'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
} from 'reka-ui'
import Button from '@/core/components/design/button.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import TableHeader from './TableHeader.vue'
import TreeTableRow from './TreeTableRow.vue'
import type { LibraryItem, BreadcrumbItem } from '@app/api'
import { useSelection } from '../composables/useSelection'
import { useInlineEdit } from '../composables/useInlineEdit'
import { useDragDrop } from '../composables/useDragDrop'
import { generateUniqueFolderName, formatDate } from '../utils/naming'

const props = defineProps<{
  items: LibraryItem[]
  currentPath: string[]
  selectedItems: string[]
  sortBy: 'name' | 'modified' | 'size' | 'kind'
  sortDirection: 'asc' | 'desc'
  currentFolderId: string | null
  breadcrumbs: BreadcrumbItem[]
  itemToEdit?: string | null
  expandedFolderIds: string[]
  expandedFolderChildren: Record<string, LibraryItem[]>
  loadingFolderIds: string[]
  isInSymlinkContext: boolean
}>()

const emit = defineEmits<{
  NAVIGATE_TO_FOLDER: [{ folderId: string | null }]
  DOUBLE_CLICK_ITEM: [{ item: LibraryItem }]
  SELECT_ITEMS: [{ itemIds: string[] }]
  SORT_BY: [{ column: 'name' | 'modified' | 'size' | 'kind' }]
  CREATE_DOCUMENT: []
  CREATE_FOLDER: [{ name: string }]
  RENAME_ITEM: [{ itemId: string; name: string }]
  DELETE_SELECTED_ITEMS: []
  BREADCRUMB_CLICK: [{ folderId: string | null }]
  EDIT_DOCUMENT: [{ documentId: string }]
  CREATE_SEARCH_INDEX: []
  START_EDITING_ITEM: [{ itemId: string }]
  MOVE_ITEMS: [{ itemIds: string[]; targetFolderId: string | null }]
  REORDER_ITEMS: [{ itemIds: string[]; targetIndex: number; targetFolderId: string | null }]
  EXPAND_FOLDER: [{ folderId: string }]
  COLLAPSE_FOLDER: [{ folderId: string }]
  CREATE_SYMLINK: [{ symlinkPath: string }]
  CREATE_SYMLINK_FILE: [{ name: string }]
  CREATE_SYMLINK_FOLDER: [{ name: string }]
}>()

// Composables
const { editingItemId, editingName, startEditingItem, confirmEdit, cancelEdit } = useInlineEdit(emit)
const { lastSelectedItemId, allItemsSelected, selectItem: selectItemBase, toggleSelectAll, clearSelection } = useSelection(
  () => props.items,
  () => props.selectedItems,
  emit
)

const {
  isDragging,
  draggedOverId,
  dropPosition,
  handleDragStart,
  handleDragOver,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  handleDragEnd,
  getItemClass,
  getDropIndicatorStyle
} = useDragDrop({
  items: computed(() => props.items),
  selectedItems: computed(() => props.selectedItems),
  isInSymlinkContext: computed(() => props.isInSymlinkContext),
  onMove: (itemIds, targetFolderId) => {
    emit('MOVE_ITEMS', { itemIds, targetFolderId })
  },
  onReorder: (itemIds, targetIndex, targetFolderId) => {
    emit('REORDER_ITEMS', { itemIds, targetIndex, targetFolderId })
  }
})

// Flattened tree items for shift-click range selection across nesting levels
const flattenedTreeItems = computed((): LibraryItem[] => {
  const result: LibraryItem[] = []
  function walk(items: LibraryItem[]) {
    for (const item of items) {
      result.push(item)
      if (item.type === 'folder' && props.expandedFolderIds.includes(item.id)) {
        const children = props.expandedFolderChildren[item.id] || []
        walk(children)
      }
    }
  }
  walk(sortedItems.value)
  return result
})

// Provide callbacks for TreeTableRow
provide('tree-select-item', (item: LibraryItem, event: MouseEvent) => selectItem(item, event))
provide('tree-double-click-item', (item: LibraryItem) => doubleClickItem(item))
provide('tree-expand-folder', (folderId: string) => emit('EXPAND_FOLDER', { folderId }))
provide('tree-collapse-folder', (folderId: string) => emit('COLLAPSE_FOLDER', { folderId }))
provide('tree-rename-item', (item: LibraryItem) => renameItem(item))
provide('tree-delete-item', (item: LibraryItem) => deleteItem(item))
provide('tree-handle-name-click', (item: LibraryItem, event: MouseEvent) => handleNameClick(item, event))
provide('tree-get-editing-item-id', () => editingItemId.value)
provide('tree-get-editing-name', () => editingName.value)
provide('tree-set-editing-name', (name: string) => { editingName.value = name })
provide('tree-confirm-edit', (itemId: string) => confirmEdit(itemId))
provide('tree-cancel-edit', () => cancelEdit())
provide('tree-selected-items', () => props.selectedItems)
provide('tree-expanded-folder-ids', () => props.expandedFolderIds)
provide('tree-expanded-folder-children', () => props.expandedFolderChildren)
provide('tree-loading-folder-ids', () => props.loadingFolderIds)

// Drag-drop provides for tree mode
provide('tree-drag-start', (e: DragEvent, item: LibraryItem) => handleDragStart(e, item))
provide('tree-drag-over', (e: DragEvent, item: LibraryItem) => handleDragOver(e, item))
provide('tree-drag-enter', (e: DragEvent, item: LibraryItem) => handleDragEnter(e, item))
provide('tree-drag-leave', (e: DragEvent) => handleDragLeave(e))
provide('tree-drop', (e: DragEvent, item: LibraryItem) => handleDrop(e, item, undefined, props.currentFolderId))
provide('tree-drag-end', () => handleDragEnd())
provide('tree-get-item-class', (item: LibraryItem) => getItemClass(item))
provide('tree-get-dragged-over-id', () => draggedOverId.value)
provide('tree-get-drop-position', () => dropPosition.value)

// Watch for external edit requests
watch(() => props.itemToEdit, (newItemId) => {
  if (newItemId) {
    const item = props.items.find(i => i.id === newItemId)
    if (item) {
      startEditingItem(item.id, item.name)
      emit('START_EDITING_ITEM', { itemId: item.id })
    }
  }
})

const deleteDialog = reactive({
  show: false,
  currentItem: null as LibraryItem | null,
  message: '',
  isUnlink: false
})

const symlinkInput = reactive({ show: false, path: '' })


const sortedItems = computed(() => {
  // If no explicit sort is selected, use displayOrder (the user's custom order)
  if (props.sortBy === 'name' && props.sortDirection === 'asc') {
    // Default sort - use displayOrder
    return [...props.items].sort((a, b) => {
      // Folders always come first
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      // Then sort by displayOrder
      return a.displayOrder - b.displayOrder
    })
  }

  // Otherwise use the selected sort
  const compareFunctions = {
    name: (a: LibraryItem, b: LibraryItem) => a.name.localeCompare(b.name),
    modified: (a: LibraryItem, b: LibraryItem) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
    size: (a: LibraryItem, b: LibraryItem) => {
      if (a.type === 'folder' && b.type === 'folder') return a.childCount - b.childCount
      if (a.type === 'document' && b.type === 'document') return a.content.length - b.content.length
      return 0
    },
    kind: (a: LibraryItem, b: LibraryItem) => a.kind.localeCompare(b.kind)
  }

  return [...props.items].sort((a, b) => {
    // Folders always come first
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1

    const compareValue = compareFunctions[props.sortBy](a, b)
    return props.sortDirection === 'asc' ? compareValue : -compareValue
  })
})

function navigateBack() {
  const parentId = props.breadcrumbs.length > 1
    ? props.breadcrumbs[props.breadcrumbs.length - 2].id
    : null
  emit('NAVIGATE_TO_FOLDER', { folderId: parentId })
}

function selectItem(item: LibraryItem, event: MouseEvent) {
  selectItemBase(item, flattenedTreeItems.value, event)
}

function handleNameClick(item: LibraryItem, event: MouseEvent) {
  const isOnlySelection = props.selectedItems.length === 1 && props.selectedItems.includes(item.id)
  const isLastSelected = lastSelectedItemId.value === item.id

  if (isOnlySelection && isLastSelected) {
    event.preventDefault()
    event.stopPropagation()
    startEditingItem(item.id, item.name)
  } else {
    selectItem(item, event)
    lastSelectedItemId.value = item.id
  }
}

function doubleClickItem(item: LibraryItem) {
  emit('DOUBLE_CLICK_ITEM', { item })
}

const sort = (column: 'name' | 'modified' | 'size' | 'kind') => emit('SORT_BY', { column })
const createDocument = () => emit('CREATE_DOCUMENT')
const createSearchIndex = () => emit('CREATE_SEARCH_INDEX')
const navigateToFolder = (folderId: string | null) => emit('NAVIGATE_TO_FOLDER', { folderId })
const navigateToBreadcrumb = (crumb: BreadcrumbItem) => emit('BREADCRUMB_CLICK', { folderId: crumb.id })

function createFolder() {
  const existingNames = props.items
    .filter(item => item.type === 'folder')
    .map(item => item.name)

  const finalName = generateUniqueFolderName(existingNames)
  emit('CREATE_FOLDER', { name: finalName })
}


function createSymlinkFolder() {
  symlinkInput.path = ''
  symlinkInput.show = true
}

async function browseSymlinkPath() {
  if (!window.electronAPI?.fileUtils.selectDirectory) return
  try {
    const dir = await window.electronAPI.fileUtils.selectDirectory()
    if (dir) symlinkInput.path = dir
  } catch (error) {
    console.error('Failed to select directory:', error)
  }
}

function confirmSymlink() {
  const path = symlinkInput.path.trim()
  if (path) {
    emit('CREATE_SYMLINK', { symlinkPath: path })
    symlinkInput.show = false
    symlinkInput.path = ''
  }
}

const renameItem = (item: LibraryItem) => startEditingItem(item.id, item.name)

function deleteItem(item: LibraryItem) {
  const isSymlinkFolder = item.type === 'folder' && (item as any).isSymlink
  deleteDialog.currentItem = item
  deleteDialog.isUnlink = isSymlinkFolder
  deleteDialog.message = isSymlinkFolder
    ? `Are you sure you want to unlink "${item.name}"? The folder on disk will not be deleted.`
    : `Are you sure you want to delete "${item.name}"?`
  deleteDialog.show = true
}

function handleDelete() {
  if (deleteDialog.currentItem) {
    // Single item deletion
    emit('SELECT_ITEMS', { itemIds: [deleteDialog.currentItem.id] })
    emit('DELETE_SELECTED_ITEMS')
  } else if (props.selectedItems.length > 0) {
    // Multi-item deletion - selected items are already selected
    emit('DELETE_SELECTED_ITEMS')
  }
  deleteDialog.show = false
  deleteDialog.currentItem = null
  deleteDialog.message = ''
  deleteDialog.isUnlink = false
}


function moveSelectedItemsUp() {
  if (props.selectedItems.length === 0 || props.currentFolderId === null) return
  if (props.isInSymlinkContext) return

  // Find the parent folder ID from breadcrumbs
  const parentFolderId = props.breadcrumbs.length > 1
    ? props.breadcrumbs[props.breadcrumbs.length - 2].id
    : null

  // Emit move items to parent folder
  emit('MOVE_ITEMS', {
    itemIds: props.selectedItems,
    targetFolderId: parentFolderId
  })
}

function deleteSelectedItems() {
  if (props.selectedItems.length === 0) return

  const itemNames = props.selectedItems
    .map(id => props.items.find(item => item.id === id)?.name)
    .filter(Boolean)

  const count = props.selectedItems.length
  const message = count === 1
    ? `Are you sure you want to delete "${itemNames[0]}"?`
    : `Are you sure you want to delete ${count} items?`

  deleteDialog.currentItem = null
  deleteDialog.message = message
  deleteDialog.show = true
}

function handleDropOnEmpty(event: DragEvent) {
  // When dropping on empty space, move items to current folder
  handleDrop(event, null, sortedItems.value.length, props.currentFolderId)
}

function handleTableContainerClick(event: MouseEvent) {
  // Check if the click is directly on the container (not on child elements like table rows)
  const target = event.target as HTMLElement

  // Only clear selection if clicking on the container itself or empty areas
  // Not when clicking on table rows, headers, or other interactive elements
  if (target.closest('tr') || target.closest('th') || target.closest('button')) {
    return
  }

  // Only deselect if not editing an item name and there are selected items
  if (editingItemId.value || props.selectedItems.length === 0) return

  // Clear selection when clicking on empty space
  clearSelection()
}

function handleEmptyRowClick(event: MouseEvent) {
  // Clicking on empty rows should clear selection
  if (editingItemId.value || props.selectedItems.length === 0) return

  event.stopPropagation()
  clearSelection()
}

function handleScrollAreaClick(event: MouseEvent) {
  // Check if click is directly on the scroll area (below the table)
  const target = event.target as HTMLElement

  // If clicking on the scrollable div itself (not table or its children)
  if (target.classList.contains('custom-scrollbar')) {
    if (editingItemId.value || props.selectedItems.length === 0) return
    clearSelection()
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (editingItemId.value) return

  const hasSelection = props.selectedItems.length > 0
  const isModified = event.metaKey || event.ctrlKey

  if (isModified && event.key === 'a') {
    event.preventDefault()
    toggleSelectAll()
  } else if (event.key === 'Delete' && hasSelection) {
    event.preventDefault()
    deleteSelectedItems()
  } else if (event.key === 'Backspace' && hasSelection && props.currentFolderId !== null) {
    // Backspace moves items up a level when in a folder
    event.preventDefault()
    moveSelectedItemsUp()
  } else if (event.key === 'Escape' && hasSelection) {
    event.preventDefault()
    clearSelection()
  }
}

// Lifecycle hooks
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

</script>

<style scoped>
/* Drag and drop visual feedback */
.draggable-item {
  position: relative;
}

.drop-indicator {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background-color: rgb(59, 130, 246);
  pointer-events: none;
  z-index: 10;
}

.drop-indicator.drop-before {
  top: -1px;
}

.drop-indicator.drop-after {
  bottom: -1px;
}

.empty-drop-zone {
  min-height: 40px;
}

.empty-drop-zone.drag-over {
  background-color: rgba(59, 130, 246, 0.1);
}
</style>
