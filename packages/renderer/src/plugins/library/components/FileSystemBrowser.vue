<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Toolbar -->
    <div class="flex flex-col gap-3 px-6 py-3 border-b border-neutral-800">
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
              class="px-2 py-1 transition-colors rounded-md hover:bg-neutral-800"
              :class="currentFolderId === null ? 'text-neutral-100 font-medium' : 'text-neutral-400 hover:text-neutral-300'"
            >
              Library
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
          <Button @click="createDocument" variant="primary" size="sm">
            <FileText class="w-4 h-4" />
            <span>New Document</span>
          </Button>
          <Button 
            @click="createFolder" 
            variant="transparent" 
            size="sm"
            class="border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
          >
            <FolderPlus class="w-4 h-4" />
            <span>New Folder</span>
          </Button>
        </div>
      </div>
    </div>

    <!-- File Table -->
    <div class="flex-1 overflow-hidden">
      <div class="h-full overflow-y-auto custom-scrollbar">
        <table class="w-full">
          <thead class="sticky top-0 z-10 bg-neutral-900">
            <tr class="text-xs font-medium text-left border-b text-neutral-500 border-neutral-800">
              <th class="px-6 py-2 cursor-pointer hover:text-neutral-300" @click="sort('name')">
                <div class="flex items-center gap-2">
                  Name
                  <ArrowUpDown class="w-3 h-3 opacity-50" />
                </div>
              </th>
              <th class="px-6 py-2 cursor-pointer hover:text-neutral-300" @click="sort('modified')">
                <div class="flex items-center gap-2">
                  Date Modified
                  <ArrowUpDown class="w-3 h-3 opacity-50" />
                </div>
              </th>
              <th class="px-6 py-2 cursor-pointer hover:text-neutral-300" @click="sort('size')">
                <div class="flex items-center gap-2">
                  Size
                  <ArrowUpDown class="w-3 h-3 opacity-50" />
                </div>
              </th>
              <th class="px-6 py-2 cursor-pointer hover:text-neutral-300" @click="sort('kind')">
                <div class="flex items-center gap-2">
                  Kind
                  <ArrowUpDown class="w-3 h-3 opacity-50" />
                </div>
              </th>
              <th class="px-6 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="sortedItems.length > 0">
              <tr
                v-for="(item, index) in sortedItems"
                :key="item.id"
                class="transition-colors duration-150 cursor-pointer group"
                :class="[
                  selectedItems.includes(item.id) 
                    ? 'bg-blue-500/30' 
                    : index % 2 === 1 
                      ? 'bg-neutral-800/20' 
                      : '',
                  !selectedItems.includes(item.id) && 'hover:bg-neutral-700/30'
                ]"
                @click="selectItem(item, $event)"
                @dblclick="doubleClickItem(item)"
              >
              <td class="px-6 py-3">
                <div class="flex items-center gap-3">
                  <Folder v-if="item.type === 'folder'" class="w-5 h-5 text-blue-400" />
                  <FileText v-else class="w-4 h-4 text-neutral-400" />
                  <span 
                    class="text-sm"
                    :class="item.type === 'folder' 
                      ? 'font-medium text-neutral-100' 
                      : 'font-normal text-neutral-200'"
                  >
                    {{ item.name }}
                  </span>
                </div>
              </td>
              <td class="px-6 py-3">
                <span class="text-sm text-neutral-400">
                  {{ formatDate(item.updatedAt) }}
                </span>
              </td>
              <td class="px-6 py-3">
                <span class="text-sm text-neutral-400">
                  {{ item.size }}
                </span>
              </td>
              <td class="px-6 py-3">
                <span class="text-sm text-neutral-400">
                  {{ item.kind }}
                </span>
              </td>
              <td class="px-6 py-3">
                <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    @click.stop="renameItem(item)"
                    class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-blue-400 hover:bg-blue-400/10 active:scale-95"
                    aria-label="Rename item"
                    title="Rename item"
                  >
                    <Edit2 class="w-4 h-4" />
                  </button>
                  <button
                    @click.stop="deleteItem(item)"
                    class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-red-400 hover:bg-red-400/10 active:scale-95"
                    aria-label="Delete item"
                    title="Delete item"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            </template>
            <!-- Fill remaining space with empty rows -->
            <tr
              v-for="n in Math.max(0, 8 - sortedItems.length)"
              :key="`empty-${n}`"
              class="pointer-events-none"
              :class="(sortedItems.length + n - 1) % 2 === 1 ? 'bg-neutral-800/20' : ''"
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
import { computed } from 'vue'
import { 
  Plus, 
  FolderPlus, 
  Folder, 
  FileText, 
  ChevronRight,
  ChevronLeft, 
  ArrowUpDown,
  Edit2,
  Trash2
} from 'lucide-vue-next'
import Button from '@/core/design/button.vue'
import type { LibraryItem, BreadcrumbItem } from '@app/api'

const props = defineProps<{
  items: LibraryItem[]
  currentPath: string[]
  selectedItems: string[]
  sortBy: 'name' | 'modified' | 'size' | 'kind'
  sortDirection: 'asc' | 'desc'
  currentFolderId: string | null
  breadcrumbs: BreadcrumbItem[]
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
}>()

const sortedItems = computed(() => {
  const sorted = [...props.items].sort((a, b) => {
    // Folders first
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1
    }
    
    let compareValue = 0
    switch (props.sortBy) {
      case 'name':
        compareValue = a.name.localeCompare(b.name)
        break
      case 'modified':
        compareValue = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        break
      case 'size':
        // For folders, compare by child count, for documents by content length
        if (a.type === 'folder' && b.type === 'folder') {
          compareValue = a.childCount - b.childCount
        } else if (a.type === 'document' && b.type === 'document') {
          compareValue = a.content.length - b.content.length
        }
        break
      case 'kind':
        compareValue = a.kind.localeCompare(b.kind)
        break
    }
    
    return props.sortDirection === 'asc' ? compareValue : -compareValue
  })
  
  return sorted
})

function navigateToFolder(folderId: string | null) {
  emit('NAVIGATE_TO_FOLDER', { folderId })
}

function navigateBack() {
  // Navigate to parent folder based on breadcrumbs
  if (props.breadcrumbs.length > 1) {
    // Go to the parent folder (second to last breadcrumb)
    const parentCrumb = props.breadcrumbs[props.breadcrumbs.length - 2]
    emit('NAVIGATE_TO_FOLDER', { folderId: parentCrumb.id })
  } else {
    // We're one level deep, go to root
    emit('NAVIGATE_TO_FOLDER', { folderId: null })
  }
}

function navigateToBreadcrumb(crumb: BreadcrumbItem) {
  emit('BREADCRUMB_CLICK', { folderId: crumb.id })
}

function selectItem(item: LibraryItem, event: MouseEvent) {
  if (event.metaKey || event.ctrlKey) {
    // Multi-select
    const newSelection = props.selectedItems.includes(item.id)
      ? props.selectedItems.filter(id => id !== item.id)
      : [...props.selectedItems, item.id]
    emit('SELECT_ITEMS', { itemIds: newSelection })
  } else {
    // Single select
    emit('SELECT_ITEMS', { itemIds: [item.id] })
  }
}

function doubleClickItem(item: LibraryItem) {
  emit('DOUBLE_CLICK_ITEM', { item })
}

function sort(column: 'name' | 'modified' | 'size' | 'kind') {
  emit('SORT_BY', { column })
}

function createDocument() {
  emit('CREATE_DOCUMENT')
}

function createFolder() {
  const name = prompt('Folder name:')
  if (name?.trim()) {
    emit('CREATE_FOLDER', { name: name.trim() })
  }
}

function renameItem(item: LibraryItem) {
  if (item.type === 'document') {
    // For documents, emit edit document event
    emit('EDIT_DOCUMENT', { documentId: item.id })
  } else {
    // For folders, rename inline
    const name = prompt('New name:', item.name)
    if (name?.trim() && name !== item.name) {
      emit('RENAME_ITEM', { itemId: item.id, name: name.trim() })
    }
  }
}

function deleteItem(item: LibraryItem) {
  if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
    emit('SELECT_ITEMS', { itemIds: [item.id] })
    emit('DELETE_SELECTED_ITEMS')
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else {
    return date.toLocaleDateString() + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}
</script>