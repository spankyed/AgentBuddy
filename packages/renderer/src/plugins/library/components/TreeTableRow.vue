<template>
  <ContextMenuRoot @update:open="contextMenuOpen = $event">
    <ContextMenuTrigger as-child>
      <tr
        class="transition-colors duration-150 cursor-pointer group select-none relative draggable-item"
        :class="[
          isSelected ? 'bg-blue-500/30' : '',
          !isSelected && contextMenuOpen ? 'bg-neutral-700/40' : '',
          !isSelected && !contextMenuOpen && 'hover:bg-neutral-700/30',
          itemClass
        ]"
        :data-folder-id="item.type === 'folder' ? item.id : undefined"
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
        <td class="px-4 py-1 relative">
          <div class="flex items-center gap-2" :style="{ paddingLeft: `${depth * 24}px` }">
            <!-- Disclosure triangle for folders (hidden for broken symlinks) -->
            <button
              v-if="item.type === 'folder' && !isBrokenSymlink"
              @click.stop="toggleExpand"
              class="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-transform duration-150 flex-shrink-0"
              :class="{ 'rotate-90': isExpanded }"
            >
              <ChevronRight class="w-3 h-3" />
            </button>
            <div v-else-if="item.type === 'folder'" class="w-4 flex-shrink-0" />
            <!-- Spacer for documents to align with folder names -->
            <div v-else class="w-4 flex-shrink-0" />

            <Link2Off v-if="isBrokenSymlink" class="w-5 h-5 text-neutral-600 flex-shrink-0" />
            <Link2 v-else-if="item.type === 'folder' && (item as any).isSymlink" class="w-5 h-5 text-purple-400 flex-shrink-0" />
            <Folder v-else-if="item.type === 'folder'" class="w-5 h-5 text-blue-400 flex-shrink-0" />
            <FileText v-else class="w-4 h-4 text-neutral-400 flex-shrink-0" />
            <div class="min-w-0 relative">
              <span
                @click.stop="handleClick($event)"
                class="text-sm truncate block"
                :class="[
                  item.type === 'folder' ? 'font-medium' : 'font-normal',
                  isEditing ? 'invisible' : 'cursor-pointer',
                  isBrokenSymlink ? 'text-neutral-600' : (!isEditing && (item.type === 'folder' ? 'text-neutral-100' : 'text-neutral-200'))
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
        <td class="px-6 py-1 whitespace-nowrap">
          <span class="text-sm text-neutral-400">{{ formatDate(item.updatedAt) }}</span>
        </td>
        <td class="px-6 py-1 whitespace-nowrap">
          <span class="text-sm text-neutral-400">{{ item.size }}</span>
        </td>
        <td class="px-6 py-1 hidden @lg:table-cell">
          <span class="text-sm text-neutral-400">{{ item.kind }}</span>
        </td>
      </tr>
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="min-w-[160px] rounded-md border border-neutral-700 bg-neutral-800 p-1 shadow-md z-50">
        <ContextMenuItem
          @select="onRename"
          class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
        >
          <Edit2 class="w-4 h-4" /> Rename
        </ContextMenuItem>
        <ContextMenuItem
          @select="copyId"
          class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
        >
          <Copy class="w-4 h-4" /> Copy Id
        </ContextMenuItem>
        <ContextMenuItem
          v-if="isSymlinkedItem && item.type === 'folder'"
          @select="refreshFolder(item.id)"
          class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
        >
          <RefreshCw class="w-4 h-4" /> Refresh
        </ContextMenuItem>
        <ContextMenuItem
          v-if="hasSymlinkPath"
          @select="copyFolderPath(item)"
          class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
        >
          <Copy class="w-4 h-4" /> Copy Path
        </ContextMenuItem>
        <ContextMenuItem
          v-if="hasSymlinkPath"
          @select="openInFinder(item)"
          class="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none"
        >
          <FolderOpen class="w-4 h-4" /> Open in Finder
        </ContextMenuItem>
        <ContextMenuSeparator class="h-px my-1 bg-neutral-700" />
        <ContextMenuItem
          v-if="isBrokenSymlink"
          @select="showRelinkForm"
          class="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-400 rounded cursor-pointer hover:bg-neutral-700 outline-none"
        >
          <Link2 class="w-4 h-4" /> Re-link
        </ContextMenuItem>
        <ContextMenuItem
          @select="onDelete"
          class="flex items-center gap-2 px-3 py-1.5 text-sm rounded cursor-pointer hover:bg-neutral-700 outline-none"
          :class="isSymlinkFolder ? 'text-purple-400' : 'text-red-400'"
        >
          <Unlink v-if="isSymlinkFolder" class="w-4 h-4" />
          <Trash2 v-else class="w-4 h-4" />
          {{ isSymlinkFolder ? 'Unlink' : 'Delete' }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>

  <!-- Inline re-link form for broken symlinks -->
  <tr v-if="isBrokenSymlink && relinkForm.show">
    <td colspan="4" class="px-4 py-1.5">
      <div class="flex items-center gap-2" :style="{ paddingLeft: `${depth * 24 + 20}px` }">
        <input
          :id="`relink-input-${item.id}`"
          v-model="relinkForm.path"
          type="text"
          class="flex-1 min-w-0 px-2.5 py-1 text-sm border rounded-md bg-neutral-900/60 border-neutral-700 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500/70"
          placeholder="Enter directory path"
          @keydown.enter.stop="confirmRelink"
          @keydown.escape.stop="relinkForm.show = false"
          @click.stop
        />
        <Button @click.stop="browseRelinkPath" variant="transparent" size="sm">Browse</Button>
        <Button @click.stop="confirmRelink" variant="primary" size="sm" :disabled="!relinkForm.path.trim()">Re-link</Button>
        <button @click.stop="relinkForm.show = false" class="p-1 text-neutral-500 hover:text-neutral-300">
          <span class="text-xs">&#x2715;</span>
        </button>
      </div>
    </td>
  </tr>

  <!-- Loading indicator row -->
  <tr v-if="item.type === 'folder' && isExpanded && isLoading">
    <td colspan="4" class="px-6 py-2">
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
import { computed, inject, ref, reactive, nextTick } from 'vue'
import { ChevronRight, Folder, FileText, Edit2, Trash2, Link2, Link2Off, Unlink, RefreshCw, Copy, FolderOpen } from 'lucide-vue-next'
import Button from '@/core/components/design/button.vue'
import {
  ContextMenuRoot, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuPortal, ContextMenuSeparator,
} from 'reka-ui'
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
const refreshFolder = inject<(folderId: string) => void>('tree-refresh-folder')!
const copyFolderPath = inject<(item: LibraryItem) => void>('tree-copy-folder-path')!
const openInFinder = inject<(item: LibraryItem) => void>('tree-open-in-finder')!
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
const sortItems = inject<(items: LibraryItem[]) => LibraryItem[]>('tree-sort-items')!

const relinkSymlink = inject<(collectionId: string, newPath: string) => void>('tree-relink-symlink')!

const contextMenuOpen = ref(false)
const relinkForm = reactive({ show: false, path: '' })
const isSymlinkFolder = computed(() => props.item.type === 'folder' && (props.item as any).isSymlink)
const isBrokenSymlink = computed(() => isSymlinkFolder.value && (props.item as any).isBroken)
const isSymlinkedItem = computed(() => (props.item as any).isSymlinked || (props.item as any).isSymlink)
const hasSymlinkPath = computed(() => !!((props.item as any).symlinkPath || (props.item as any).filePath))
const isSelected = computed(() => selectedItems().includes(props.item.id))
const isExpanded = computed(() => expandedFolderIds().includes(props.item.id))
const isLoading = computed(() => loadingFolderIds().includes(props.item.id))
const isEditing = computed(() => getEditingItemId() === props.item.id)
const editingName = computed(() => isEditing.value ? getEditingName() : '')
const itemClass = computed(() => getItemClass(props.item))

const children = computed(() => {
  if (props.item.type !== 'folder') return []
  const items = expandedFolderChildren()[props.item.id] || []
  return sortItems(items)
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

function copyId() {
  const text = props.item.type === 'document' ? props.item.shortCode : props.item.id
  navigator.clipboard.writeText(text)
}

function showRelinkForm() {
  relinkForm.path = ''
  relinkForm.show = true
  // Delay focus to let the context menu finish closing
  setTimeout(() => {
    document.getElementById(`relink-input-${props.item.id}`)?.focus()
  }, 50)
}

async function browseRelinkPath() {
  if (!window.electronAPI?.fileUtils.selectDirectory) return
  try {
    const dir = await window.electronAPI.fileUtils.selectDirectory()
    if (dir) {
      relinkForm.path = dir
      confirmRelink()
    }
  } catch {
    // User cancelled
  }
}

function confirmRelink() {
  const path = relinkForm.path.trim()
  if (!path) return
  relinkSymlink(props.item.id, path)
  relinkForm.show = false
  relinkForm.path = ''
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
