<template>
  <TrackedContextMenuRoot>
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
          v-if="file.type === 'directory'"
          @select="$emit('open-terminal', file.path)"
          :class="MENU_ITEM_CLASS"
        >
          <Terminal class="w-4 h-4" />
          Open Terminal Here
        </ContextMenuItem>

        <!-- Project menu items - only for directories -->
        <ProjectMenuItems
          v-if="file.type === 'directory'"
          :directory-path="file.path"
          :ItemComponent="ContextMenuItem"
          :SeparatorComponent="ContextMenuSeparator"
          :SubComponent="ContextMenuSub"
          :SubTriggerComponent="ContextMenuSubTrigger"
          :SubContentComponent="ContextMenuSubContent"
          :PortalComponent="ContextMenuPortal"
          :CheckboxItemComponent="ContextMenuCheckboxItem"
          :ItemIndicatorComponent="ContextMenuItemIndicator"
        />

        <ContextMenuSeparator :class="MENU_SEPARATOR_CLASS" />

        <ContextMenuItem
          @select="$emit('delete', file)"
          :class="MENU_ITEM_DANGER_CLASS"
        >
          <Trash2 class="w-4 h-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </TrackedContextMenuRoot>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  Folder,
  Edit2,
  Trash2,
  Copy,
  Terminal,
  FolderOpen,
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
import ProjectMenuItems from './components/ProjectMenuItems.vue'
import { MENU_ITEM_CLASS, MENU_ITEM_DANGER_CLASS, MENU_SEPARATOR_CLASS } from './constants'
import { getFileIcon } from '../../utils/file-icons'
import TrackedContextMenuRoot from '@/core/components/design/TrackedContextMenuRoot.vue'

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v'])

interface FileItem {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  size?: number
}

const props = defineProps<{
  file: FileItem
  baseDirectory?: string | null
}>()

const emit = defineEmits<{
  'click': [file: FileItem]
  'rename': [oldPath: string, newName: string]
  'delete': [file: FileItem]
  'open-terminal': [path: string]
}>()

// Editing state
const isEditing = ref(false)
const editingName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

// Computed icon based on file type/extension
const icon = computed(() => {
  if (props.file.type === 'directory') return Folder
  return getFileIcon(props.file.extension)
})

const isVideo = computed(() =>
  props.file.type === 'file' && VIDEO_EXTENSIONS.has(props.file.extension?.toLowerCase() || '')
)

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
    emit('click', props.file)
  }
}

const handleDoubleClick = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
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

const copyRelativePath = async () => {
  try {
    let relativePath = props.file.path

    // If baseDirectory is provided, calculate the relative path
    if (props.baseDirectory) {
      // Ensure both paths use forward slashes
      const normalizedRoot = props.baseDirectory.replace(/\\/g, '/')
      const normalizedPath = props.file.path.replace(/\\/g, '/')

      // Remove the root directory from the path
      if (normalizedPath.startsWith(normalizedRoot)) {
        relativePath = normalizedPath.slice(normalizedRoot.length)
        // Remove leading slash if present
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1)
        }
      }
    }

    await navigator.clipboard.writeText(relativePath)
  } catch (err) {
    console.error('Failed to copy path to clipboard:', err)
  }
}

const copyAbsolutePath = async () => {
  try {
    await navigator.clipboard.writeText(props.file.path)
  } catch (err) {
    console.error('Failed to copy absolute path to clipboard:', err)
  }
}

const openInFinder = () => {
  window.electronAPI?.shell.showItemInFolder(props.file.path)
}

const openInVideoPlayer = () => {
  window.electronAPI?.shell.openPath(props.file.path)
}
</script>
