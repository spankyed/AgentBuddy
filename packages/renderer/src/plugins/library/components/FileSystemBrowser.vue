<template>
  <div ref="containerRef" class="@container flex flex-col h-full bg-neutral-900" tabindex="-1">

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
    <div class="pl-3 pr-6 py-3 border-b border-neutral-800" @click.stop>
      <!-- Navigation Row -->
      <div class="flex items-center justify-between gap-4">
        <!-- Back Button and Breadcrumbs -->
        <div class="flex items-center gap-1">
          <!-- Back Button (always visible, disabled at root) -->
          <button
            @click="navigateBack"
            :disabled="currentFolderId === null"
            class="p-1 rounded-md transition-colors active:scale-95"
            :class="currentFolderId !== null
              ? 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800'
              : 'text-neutral-700 cursor-default'"
            aria-label="Go back"
            title="Go back"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>

          <!-- Breadcrumb Navigation -->
          <nav class="flex items-center gap-0.5 text-sm" aria-label="Folder path">
            <!-- Home (root) -->
            <button
              @click="navigateToFolder(null)"
              class="p-1 transition-colors rounded-md hover:bg-neutral-800"
              :class="currentFolderId === null ? 'text-neutral-200' : 'text-neutral-500 hover:text-neutral-300'"
              title="Home"
            >
              <Home class="w-4 h-4" />
            </button>

            <template v-if="displayBreadcrumbs.length > 0">
              <!-- Ellipsis for collapsed middle segments -->
              <template v-if="isPathTruncated">
                <span class="text-neutral-600 text-xs mx-0.5">/</span>
                <button
                  @click="navigateToBreadcrumb(breadcrumbs[breadcrumbs.length - 3])"
                  class="px-1.5 py-0.5 text-neutral-500 transition-colors rounded-md hover:text-neutral-300 hover:bg-neutral-800"
                  title="Go to parent"
                >
                  ...
                </button>
              </template>

              <!-- Visible breadcrumb segments -->
              <template v-for="(crumb, index) in displayBreadcrumbs" :key="crumb.id">
                <span class="text-neutral-600 text-xs mx-0.5">/</span>
                <ContextMenuRoot>
                  <ContextMenuTrigger as-child>
                    <template v-if="editingBreadcrumbId === crumb.id">
                      <input
                        :id="'edit-input-' + crumb.id"
                        v-model="editingBreadcrumbName"
                        class="px-1.5 py-0.5 text-sm bg-neutral-800 border border-blue-500 rounded-md text-neutral-100 outline-none max-w-[160px]"
                        @keydown.enter="confirmBreadcrumbEdit(crumb.id!)"
                        @keydown.escape="cancelBreadcrumbEdit()"
                        @blur="confirmBreadcrumbEdit(crumb.id!)"
                      />
                    </template>
                    <button
                      v-else
                      @click="navigateToBreadcrumb(crumb)"
                      class="px-1.5 py-0.5 transition-colors rounded-md hover:bg-neutral-800 truncate max-w-[160px]"
                      :class="index === displayBreadcrumbs.length - 1
                        ? 'text-neutral-100 font-medium'
                        : 'text-neutral-500 hover:text-neutral-300'"
                      :title="crumb.name"
                    >
                      {{ crumb.name }}
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuPortal>
                    <ContextMenuContent class="min-w-[160px] rounded-md border border-neutral-700 bg-neutral-800 p-1 shadow-md z-50">
                      <ContextMenuItem
                        @select="startBreadcrumbRename(crumb)"
                        class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
                      >
                        <Edit2 class="w-4 h-4" /> Rename
                      </ContextMenuItem>
                      <template v-if="isBreadcrumbSymlink(crumb)">
                        <ContextMenuItem
                          @select="copyBreadcrumbPath(crumb)"
                          class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
                        >
                          <Copy class="w-4 h-4" /> Copy Path
                        </ContextMenuItem>
                        <ContextMenuSeparator class="h-px my-1 bg-neutral-700" />
                        <ContextMenuItem
                          @select="emit('REFRESH_FOLDER', { folderId: crumb.id! })"
                          class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
                        >
                          <RefreshCw class="w-4 h-4" /> Refresh
                        </ContextMenuItem>
                      </template>
                    </ContextMenuContent>
                  </ContextMenuPortal>
                </ContextMenuRoot>
              </template>
            </template>
          </nav>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2 relative">
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

          <!-- [SEARCH_INDEX_FF] Create Index button — commented out
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
          -->
          <ContextMenuRoot>
            <ContextMenuTrigger as-child>
              <Button
                @click="createFolder"
                variant="transparent"
                size="sm"
                class="border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
              >
                <FolderPlus class="w-4 h-4" />
                <span class="hidden @lg:inline">New Folder</span>
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
            <span class="hidden @lg:inline">{{ isInSymlinkContext ? 'New File' : 'New Document' }}</span>
          </Button>
          <div
            v-if="symlinkInput.show"
            class="absolute top-full right-0 mt-2 z-50 flex items-center gap-2 p-3 rounded-md border border-neutral-700 bg-neutral-800 shadow-lg"
          >
            <input
              v-model="symlinkInput.path"
              type="text"
              class="w-96 px-3 py-1.5 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
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
        </div>
      </div>
    </div>

    <!-- File Table -->
    <div class="flex-1 overflow-hidden" @click="handleTableContainerClick">
      <div class="h-full overflow-y-auto overflow-x-auto custom-scrollbar" @click="handleScrollAreaClick">
        <table class="w-full min-w-[480px]"  data-onboarding-id="library-table">
          <thead class="sticky top-0 z-10 bg-neutral-900 shadow-[inset_0_-1px_0_0_theme(colors.neutral.800)]">
            <tr class="text-xs font-medium text-left text-neutral-500">
              <TableHeader @click="sort('name')" class="!pl-6 w-[60%]">Name</TableHeader>
              <TableHeader @click="sort('modified')" class="w-[18%]">
                <span class="@lg:hidden">Modified</span>
                <span class="hidden @lg:inline">Date Modified</span>
              </TableHeader>
              <TableHeader @click="sort('size')" class="w-[10%]">Size</TableHeader>
              <TableHeader @click="sort('kind')" class="w-[12%] hidden @lg:table-cell">Kind</TableHeader>
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
              <td colspan="4" class="h-64">
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
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, provide, onMounted, onUnmounted } from 'vue'
import {
  FolderPlus,
  FileText,
  ChevronLeft,
  Home,
  Trash2,
  // Search, // [SEARCH_INDEX_FF]
  ArrowUp,
  FolderOpen,
  Link,
  X,
  Edit2,
  RefreshCw,
  Copy,
} from 'lucide-vue-next'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
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
  currentSymlinkRootId?: string | null
  symlinkBasePath?: string | null
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
  REFRESH_FOLDER: [{ folderId: string }]
  CREATE_SYMLINK: [{ symlinkPath: string }]
  CREATE_SYMLINK_FILE: [{ name: string }]
  CREATE_SYMLINK_FOLDER: [{ name: string }]
}>()

// Composables
const containerRef = ref<HTMLElement | null>(null)
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
provide('tree-refresh-folder', (folderId: string) => emit('REFRESH_FOLDER', { folderId }))
provide('tree-copy-folder-path', (item: LibraryItem) => {
  const fullPath = getSymlinkItemFullPath(item)
  if (fullPath) navigator.clipboard.writeText(fullPath)
})
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

// Breadcrumb inline editing (reuse composable)
const {
  editingItemId: editingBreadcrumbId,
  editingName: editingBreadcrumbName,
  startEditingItem: startBreadcrumbEdit,
  confirmEdit: confirmBreadcrumbEdit,
  cancelEdit: cancelBreadcrumbEdit,
} = useInlineEdit(emit)

function isBreadcrumbSymlink(crumb: BreadcrumbItem): boolean {
  if (!crumb.id) return false
  return crumb.id.startsWith('symlink:') || crumb.id === props.currentSymlinkRootId
}

function startBreadcrumbRename(crumb: BreadcrumbItem) {
  if (crumb.id) startBreadcrumbEdit(crumb.id, crumb.name)
}

function getBreadcrumbPath(crumb: BreadcrumbItem): string | null {
  if (!crumb.id || !props.symlinkBasePath) return null
  if (crumb.id === props.currentSymlinkRootId) return props.symlinkBasePath
  if (crumb.id.startsWith('symlink:')) {
    const rest = crumb.id.slice('symlink:'.length)
    const slashIdx = rest.indexOf('/')
    const relPath = slashIdx !== -1 ? rest.slice(slashIdx + 1) : ''
    return relPath ? `${props.symlinkBasePath}/${relPath}` : props.symlinkBasePath
  }
  return null
}

function copyBreadcrumbPath(crumb: BreadcrumbItem) {
  const fullPath = getBreadcrumbPath(crumb)
  if (fullPath) navigator.clipboard.writeText(fullPath)
}

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

function getSymlinkItemFullPath(item: LibraryItem): string | null {
  if ((item as any).symlinkPath) return (item as any).symlinkPath
  if ((item as any).filePath) return (item as any).filePath
  return null
}

function doubleClickItem(item: LibraryItem) {
  emit('DOUBLE_CLICK_ITEM', { item })
}

const sort = (column: 'name' | 'modified' | 'size' | 'kind') => emit('SORT_BY', { column })
const createDocument = () => emit('CREATE_DOCUMENT')
const createSearchIndex = () => emit('CREATE_SEARCH_INDEX')
const navigateToFolder = (folderId: string | null) => emit('NAVIGATE_TO_FOLDER', { folderId })
const navigateToBreadcrumb = (crumb: BreadcrumbItem) => emit('BREADCRUMB_CLICK', { folderId: crumb.id })

const displayBreadcrumbs = computed(() => {
  if (props.breadcrumbs.length <= 3) return props.breadcrumbs
  return props.breadcrumbs.slice(-2)
})

const isPathTruncated = computed(() => props.breadcrumbs.length > 3)

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
    if (dir) {
      symlinkInput.path = dir
      confirmSymlink()
    }
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
  if (!containerRef.value?.contains(event.target as Node)) return

  const hasSelection = props.selectedItems.length > 0
  const isModified = event.metaKey || event.ctrlKey

  if (isModified && event.key === 'a') {
    event.preventDefault()
    toggleSelectAll()
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
    event.preventDefault()
    deleteSelectedItems()
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
