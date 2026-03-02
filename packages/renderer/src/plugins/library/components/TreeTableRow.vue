<template>
  <tr
    class="transition-colors duration-150 cursor-pointer group select-none relative draggable-item"
    :class="[
      isSelected ? 'bg-blue-500/30' : '',
      !isSelected && 'hover:bg-neutral-700/30',
      itemClass
    ]"
    :draggable="!isEditing"
    @click="handleClick($event)"
    @dblclick="handleDoubleClick"
    @dragstart="onDragStart($event)"
    @dragover="onDragOver($event)"
    @dragenter="onDragEnter($event)"
    @dragleave="onDragLeave($event)"
    @drop="onDrop($event)"
    @dragend="onDragEnd()"
  >
    <td class="px-4 py-3 relative">
      <!-- Drop indicator -->
      <div
        v-if="showDropIndicator"
        class="drop-indicator"
        :class="currentDropPosition === 'before' ? 'drop-before' : 'drop-after'"
      />
      <div class="flex items-center gap-2" :style="{ paddingLeft: `${depth * 24}px` }">
        <!-- Disclosure triangle for folders -->
        <button
          v-if="item.type === 'folder'"
          @click.stop="toggleExpand"
          class="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-transform duration-150 flex-shrink-0"
          :class="{ 'rotate-90': isExpanded }"
        >
          <ChevronRight class="w-3 h-3" />
        </button>
        <!-- Spacer for documents to align with folder names -->
        <div v-else class="w-4 flex-shrink-0" />

        <Link v-if="item.type === 'folder' && (item as any).isSymlink" class="w-5 h-5 text-purple-400 flex-shrink-0" />
        <Folder v-else-if="item.type === 'folder'" class="w-5 h-5 text-blue-400 flex-shrink-0" />
        <FileText v-else class="w-4 h-4 text-neutral-400 flex-shrink-0" />
        <div class="min-w-0 relative">
          <span
            @click.stop="handleNameClickLocal($event)"
            class="text-sm"
            :class="[
              item.type === 'folder' ? 'font-medium' : 'font-normal',
              isEditing ? 'invisible' : 'cursor-pointer',
              !isEditing && (item.type === 'folder' ? 'text-neutral-100' : 'text-neutral-200')
            ]"
          >
            {{ item.name }}
          </span>
          <input
            v-if="isEditing"
            :id="`edit-input-${item.id}`"
            :value="editingName"
            @input="onEditInput"
            @click.stop
            @keydown.enter.stop="onConfirmEdit"
            @keydown.escape.stop="onCancelEdit"
            @blur="onConfirmEdit"
            type="text"
            class="absolute inset-0 px-0.5 text-sm bg-neutral-850 border border-blue-400 text-neutral-100 focus:outline-none rounded-sm"
            :class="item.type === 'folder' ? 'font-medium' : 'font-normal'"
            :style="`width: min(max(${(editingName || '').length + 2}ch, 10ch), 40ch);`"
          />
        </div>
      </div>
    </td>
    <td class="px-6 py-3">
      <span class="text-sm text-neutral-400">{{ formatDate(item.updatedAt) }}</span>
    </td>
    <td class="px-6 py-3">
      <span class="text-sm text-neutral-400">{{ item.size }}</span>
    </td>
    <td class="px-6 py-3">
      <span class="text-sm text-neutral-400">{{ item.kind }}</span>
    </td>
    <td class="px-6 py-3">
      <div class="flex items-center justify-end gap-2">
        <button
          @click.stop="onRename"
          class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-blue-400 hover:bg-blue-400/10 active:scale-95"
          aria-label="Rename item"
          title="Rename item"
        >
          <Edit2 class="w-4 h-4" />
        </button>
        <button
          @click.stop="onDelete"
          class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-red-400 hover:bg-red-400/10 active:scale-95"
          aria-label="Delete item"
          title="Delete item"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </td>
  </tr>

  <!-- Loading indicator row -->
  <tr v-if="item.type === 'folder' && isExpanded && isLoading">
    <td colspan="5" class="px-6 py-2">
      <div class="flex items-center gap-2" :style="{ paddingLeft: `${(depth + 1) * 16 + 16}px` }">
        <div class="w-3.5 h-3.5 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin" />
        <span class="text-xs text-neutral-500">Loading...</span>
      </div>
    </td>
  </tr>

  <!-- Recursively render children -->
  <template v-if="item.type === 'folder' && isExpanded && !isLoading && children.length > 0">
    <TreeTableRow
      v-for="child in children"
      :key="child.id"
      :item="child"
      :depth="depth + 1"
    />
  </template>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { ChevronRight, Folder, FileText, Edit2, Trash2, Link } from 'lucide-vue-next'
import type { LibraryItem } from '@app/api'
import { formatDate } from '../utils/naming'

const props = defineProps<{
  item: LibraryItem
  depth: number
}>()

// Injected callbacks from FileSystemBrowser
const selectItem = inject<(item: LibraryItem, event: MouseEvent) => void>('tree-select-item')!
const doubleClickItem = inject<(item: LibraryItem) => void>('tree-double-click-item')!
const expandFolder = inject<(folderId: string) => void>('tree-expand-folder')!
const collapseFolder = inject<(folderId: string) => void>('tree-collapse-folder')!
const renameItem = inject<(item: LibraryItem) => void>('tree-rename-item')!
const deleteItem = inject<(item: LibraryItem) => void>('tree-delete-item')!
const handleNameClick = inject<(item: LibraryItem, event: MouseEvent) => void>('tree-handle-name-click')!
const getEditingItemId = inject<() => string | null>('tree-get-editing-item-id')!
const getEditingName = inject<() => string>('tree-get-editing-name')!
const setEditingName = inject<(name: string) => void>('tree-set-editing-name')!
const confirmEdit = inject<(itemId: string) => void>('tree-confirm-edit')!
const cancelEdit = inject<() => void>('tree-cancel-edit')!
const selectedItems = inject<() => string[]>('tree-selected-items')!
const expandedFolderIds = inject<() => string[]>('tree-expanded-folder-ids')!
const expandedFolderChildren = inject<() => Record<string, LibraryItem[]>>('tree-expanded-folder-children')!
const loadingFolderIds = inject<() => string[]>('tree-loading-folder-ids')!

// Drag-drop injected callbacks
const dragStart = inject<(e: DragEvent, item: LibraryItem) => void>('tree-drag-start')!
const dragOver = inject<(e: DragEvent, item: LibraryItem, index?: number) => void>('tree-drag-over')!
const dragEnter = inject<(e: DragEvent, item: LibraryItem) => void>('tree-drag-enter')!
const dragLeave = inject<(e: DragEvent) => void>('tree-drag-leave')!
const drop = inject<(e: DragEvent, item: LibraryItem) => void>('tree-drop')!
const dragEnd = inject<() => void>('tree-drag-end')!
const getItemClass = inject<(item: LibraryItem) => string>('tree-get-item-class')!
const getDraggedOverId = inject<() => string | null>('tree-get-dragged-over-id')!
const getDropPosition = inject<() => 'before' | 'after' | 'inside' | null>('tree-get-drop-position')!

const isSelected = computed(() => selectedItems().includes(props.item.id))
const isExpanded = computed(() => expandedFolderIds().includes(props.item.id))
const isLoading = computed(() => loadingFolderIds().includes(props.item.id))
const isEditing = computed(() => getEditingItemId() === props.item.id)
const editingName = computed(() => isEditing.value ? getEditingName() : '')
const itemClass = computed(() => getItemClass(props.item))
const currentDraggedOverId = computed(() => getDraggedOverId())
const currentDropPosition = computed(() => getDropPosition())

const showDropIndicator = computed(() =>
  currentDraggedOverId.value === props.item.id &&
  currentDropPosition.value &&
  currentDropPosition.value !== 'inside'
)

const children = computed(() => {
  if (props.item.type !== 'folder') return []
  return expandedFolderChildren()[props.item.id] || []
})

function toggleExpand() {
  if (isExpanded.value) {
    collapseFolder(props.item.id)
  } else {
    expandFolder(props.item.id)
  }
}

function handleClick(event: MouseEvent) {
  selectItem(props.item, event)
}

function handleDoubleClick() {
  doubleClickItem(props.item)
}

function handleNameClickLocal(event: MouseEvent) {
  handleNameClick(props.item, event)
}

function onEditInput(event: Event) {
  setEditingName((event.target as HTMLInputElement).value)
}

function onConfirmEdit() {
  confirmEdit(props.item.id)
}

function onCancelEdit() {
  cancelEdit()
}

function onRename() {
  renameItem(props.item)
}

function onDelete() {
  deleteItem(props.item)
}

// Drag-drop handlers
function onDragStart(e: DragEvent) {
  dragStart(e, props.item)
}

function onDragOver(e: DragEvent) {
  dragOver(e, props.item)
}

function onDragEnter(e: DragEvent) {
  dragEnter(e, props.item)
}

function onDragLeave(e: DragEvent) {
  dragLeave(e)
}

function onDrop(e: DragEvent) {
  drop(e, props.item)
}

function onDragEnd() {
  dragEnd()
}
</script>
