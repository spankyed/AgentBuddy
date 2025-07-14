<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <!-- Breadcrumb Navigation -->
      <div class="flex items-center gap-2">
        <button 
          @click="navigateToFolder(null)"
          class="px-3 py-1 text-sm transition-colors rounded-md hover:bg-neutral-800 text-neutral-300"
        >
          Library
        </button>
        <span v-for="(segment, index) in currentPath" :key="index" class="flex items-center gap-2">
          <ChevronRight class="w-4 h-4 text-neutral-500" />
          <span class="px-3 py-1 text-sm text-neutral-400">{{ segment }}</span>
        </span>
      </div>
      
      <!-- Actions -->
      <div class="flex items-center gap-2">
        <Button @click="createDocument" variant="primary">
          <Plus class="w-4 h-4" />
          <span>New Document</span>
        </Button>
        <Button @click="createFolder" variant="transparent">
          <FolderPlus class="w-4 h-4" />
          <span>New Folder</span>
        </Button>
      </div>
    </div>

    <!-- File Table -->
    <div class="flex-1 overflow-hidden">
      <div v-if="items.length > 0" class="h-full overflow-y-auto custom-scrollbar">
        <table class="w-full">
          <thead class="sticky top-0 z-10 bg-neutral-900">
            <tr class="text-xs font-medium tracking-wider text-left uppercase border-b text-neutral-400 border-neutral-800">
              <th class="px-6 py-3 cursor-pointer hover:text-neutral-300" @click="sort('name')">
                <div class="flex items-center gap-2">
                  Name
                  <ArrowUpDown class="w-3 h-3" />
                </div>
              </th>
              <th class="px-6 py-3 cursor-pointer hover:text-neutral-300" @click="sort('modified')">
                <div class="flex items-center gap-2">
                  Date Modified
                  <ArrowUpDown class="w-3 h-3" />
                </div>
              </th>
              <th class="px-6 py-3 cursor-pointer hover:text-neutral-300" @click="sort('size')">
                <div class="flex items-center gap-2">
                  Size
                  <ArrowUpDown class="w-3 h-3" />
                </div>
              </th>
              <th class="px-6 py-3 cursor-pointer hover:text-neutral-300" @click="sort('kind')">
                <div class="flex items-center gap-2">
                  Kind
                  <ArrowUpDown class="w-3 h-3" />
                </div>
              </th>
              <th class="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-800">
            <tr
              v-for="item in sortedItems"
              :key="item.id"
              class="transition-all duration-200 cursor-pointer group hover:bg-neutral-800"
              :class="{ 'bg-neutral-800': selectedItems.includes(item.id) }"
              @click="selectItem(item, $event)"
              @dblclick="doubleClickItem(item)"
            >
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex items-center justify-center w-8 h-8 transition-colors rounded-lg bg-neutral-800 group-hover:bg-neutral-700">
                    <Folder v-if="item.type === 'folder'" class="w-4 h-4 text-blue-400" />
                    <FileText v-else class="w-4 h-4 text-neutral-400" />
                  </div>
                  <span class="font-medium text-neutral-100">{{ item.name }}</span>
                </div>
              </td>
              <td class="px-6 py-4">
                <span class="text-sm text-neutral-300">
                  {{ formatDate(item.updatedAt) }}
                </span>
              </td>
              <td class="px-6 py-4">
                <span class="text-sm text-neutral-300">
                  {{ item.size }}
                </span>
              </td>
              <td class="px-6 py-4">
                <span class="text-sm text-neutral-300">
                  {{ item.kind }}
                </span>
              </td>
              <td class="px-6 py-4">
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
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div
        v-else
        class="flex flex-col items-center justify-center h-full"
      >
        <div class="flex flex-col items-center max-w-sm text-center">
          <div class="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-800">
            <Folder class="w-8 h-8 text-neutral-500" />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-neutral-100">This folder is empty</h3>
          <p class="mb-6 text-sm text-neutral-400">
            Create your first document or folder to get started
          </p>
          <div class="flex gap-3">
            <Button @click="createDocument" variant="primary">
              <Plus class="w-4 h-4" />
              <span>New Document</span>
            </Button>
            <Button @click="createFolder" variant="transparent">
              <FolderPlus class="w-4 h-4" />
              <span>New Folder</span>
            </Button>
          </div>
        </div>
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
  ArrowUpDown,
  Edit2,
  Trash2
} from 'lucide-vue-next'
import Button from '@/core/design/button.vue'
import type { LibraryItem } from '@abuddy/api'

const props = defineProps<{
  items: LibraryItem[]
  currentPath: string[]
  selectedItems: string[]
  sortBy: 'name' | 'modified' | 'size' | 'kind'
  sortDirection: 'asc' | 'desc'
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
  const name = prompt('New name:', item.name)
  if (name?.trim() && name !== item.name) {
    emit('RENAME_ITEM', { itemId: item.id, name: name.trim() })
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