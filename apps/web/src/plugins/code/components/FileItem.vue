<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <div
        @click="handleClick"
        @dblclick="handleDoubleClick"
        class="flex items-center gap-2 px-4 py-1 transition-colors cursor-pointer"
        :class="{
          'bg-neutral-800': isEditing,
          'hover:bg-neutral-800': !isEditing
        }"
      >
        <component 
          :is="icon"
          class="flex-shrink-0 w-4 h-4"
          :class="file.type === 'directory' ? 'text-blue-400' : 'text-neutral-400'"
        />
        
        <input
          v-if="isEditing"
          v-model="editingName"
          @keydown.enter.stop="confirmRename"
          @keydown.esc.stop="cancelRename"
          @blur="confirmRename"
          @click.stop
          class="flex-1 px-1 py-0 -mx-1 text-sm border rounded bg-neutral-900 border-neutral-600 text-neutral-200 focus:outline-none focus:border-blue-500 focus:bg-neutral-800"
          ref="renameInput"
        />
        <span v-else class="text-sm truncate text-neutral-200">{{ file.name }}</span>
        
        <span 
          v-if="file.type === 'file' && file.size && !isEditing" 
          class="ml-auto text-xs text-neutral-500"
        >
          {{ formatFileSize(file.size) }}
        </span>
      </div>
    </ContextMenuTrigger>
    
    <ContextMenuPortal>
      <ContextMenuContent
        class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
      >
        <ContextMenuItem
          @select="startRename"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
        >
          <Edit2 class="w-4 h-4" />
          Rename
        </ContextMenuItem>
        
        <ContextMenuSeparator class="h-px my-1 bg-neutral-700" />
        
        <ContextMenuItem
          @select="$emit('delete', file)"
          class="flex items-center gap-2 px-3 py-2 text-sm text-red-400 transition-colors cursor-pointer hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
        >
          <Trash2 class="w-4 h-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import {
  Folder,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  Edit2,
  Trash2,
} from 'lucide-vue-next'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
} from 'reka-ui'

interface FileItem {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  size?: number
}

const props = defineProps<{
  file: FileItem
}>()

const emit = defineEmits<{
  'click': [file: FileItem]
  'rename': [oldPath: string, newName: string]
  'delete': [file: FileItem]
}>()

// Editing state
const isEditing = ref(false)
const editingName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

// Click handling
let clickTimer: number | null = null
const DOUBLE_CLICK_DELAY = 160

// Computed icon based on file type/extension
const icon = computed(() => {
  if (props.file.type === 'directory') return Folder
  
  const ext = props.file.extension
  if (!ext) return File
  
  const codeExtensions = ['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'php', 'rb', 'swift']
  const textExtensions = ['txt', 'md', 'log', 'csv', 'xml', 'yaml', 'yml']
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp']
  
  if (codeExtensions.includes(ext)) return FileCode
  if (ext === 'json') return FileJson
  if (textExtensions.includes(ext)) return FileText
  if (imageExtensions.includes(ext)) return Image
  
  return File
})

// Focus input when editing starts
watch(isEditing, async (editing) => {
  if (editing) {
    await nextTick()
    renameInput.value?.focus()
    renameInput.value?.select()
  }
})

const handleClick = () => {
  if (!isEditing.value) {
    // Clear any existing timer
    if (clickTimer) {
      clearTimeout(clickTimer)
      clickTimer = null
    }
    
    // Set a new timer to delay the single click
    clickTimer = setTimeout(() => {
      emit('click', props.file)
      clickTimer = null
    }, DOUBLE_CLICK_DELAY) as unknown as number
  }
}

const handleDoubleClick = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  
  // Clear the single click timer
  if (clickTimer) {
    clearTimeout(clickTimer)
    clickTimer = null
  }
  
  startRename()
}

const startRename = () => {
  // Small delay to allow context menu to close
  setTimeout(() => {
    editingName.value = props.file.name
    isEditing.value = true
  }, 50)
}

const confirmRename = () => {
  const trimmedName = editingName.value.trim()
  if (trimmedName && trimmedName !== props.file.name) {
    emit('rename', props.file.path, trimmedName)
  }
  cancelRename()
}

const cancelRename = () => {
  isEditing.value = false
  editingName.value = ''
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Cleanup timer on unmount
onUnmounted(() => {
  if (clickTimer) {
    clearTimeout(clickTimer)
  }
})
</script>