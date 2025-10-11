<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <div
        class="flex items-center gap-1.5 px-2 py-0 min-h-[2.5rem] cursor-pointer group-label flex-shrink-0 transition-all hover:brightness-110"
        :style="{
          backgroundColor: `color-mix(in srgb, var(--color-${color}) 10%, transparent)`,
          borderLeft: isCollapsed ? `3px solid var(--color-${color})` : 'none',
          borderBottom: !isCollapsed ? `2px solid var(--color-${color})` : 'none',
          borderTop: isDragOver ? `3px solid var(--color-${color})` : 'none'
        }"
        :data-group-id="groupId"
        @click.stop="$emit('toggle')"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop.prevent.stop="handleDrop"
      >
        <!-- Group name (editable on double-click) -->
        <input
          v-if="isEditing"
          ref="nameInput"
          v-model="editedName"
          @click.stop
          @blur="saveEdit"
          @keydown.enter="saveEdit"
          @keydown.escape="cancelEdit"
          class="px-1 text-xs font-medium bg-transparent border rounded text-neutral-200 border-neutral-600 focus:outline-none focus:border-blue-500"
          style="width: 80px"
        />
        <span
          v-else
          @dblclick.stop="startEdit"
          class="text-xs font-medium text-neutral-300 whitespace-nowrap select-none"
        >
          {{ name }}
        </span>

        <!-- Context menu trigger -->
        <button
          @click.stop
          class="flex items-center justify-center w-4 h-4 transition-opacity rounded-sm opacity-0 group-label:hover:opacity-100 hover:bg-neutral-700/50"
        >
          <MoreHorizontal class="w-3 h-3 text-neutral-400" />
        </button>
      </div>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent class="min-w-[180px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
        <ContextMenuItem
          @select="startEdit"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
        >
          <Edit2 class="w-4 h-4" />
          Rename Group
        </ContextMenuItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none">
            <Palette class="w-4 h-4" />
            Change Color
            <ChevronRight class="w-3 h-3 ml-auto" />
          </ContextMenuSubTrigger>
          <ContextMenuPortal>
            <ContextMenuSubContent class="min-w-[140px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
              <ContextMenuItem
                v-for="colorOption in colors"
                :key="colorOption"
                @select="$emit('change-color', colorOption)"
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                <div
                  class="w-3 h-3 rounded-full"
                  :style="{ backgroundColor: `var(--color-${colorOption})` }"
                />
                <span class="capitalize">{{ colorOption }}</span>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuPortal>
        </ContextMenuSub>

        <ContextMenuSeparator class="h-px my-1 bg-neutral-700" />

        <ContextMenuItem
          @select="$emit('ungroup-all')"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
        >
          <FolderOpen class="w-4 h-4" />
          Ungroup All Tabs
        </ContextMenuItem>

        <ContextMenuItem
          @select="$emit('close-all')"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
        >
          <XCircle class="w-4 h-4" />
          Close All Tabs
        </ContextMenuItem>

        <ContextMenuSeparator class="h-px my-1 bg-neutral-700" />

        <ContextMenuItem
          v-if="isPinned"
          @select="$emit('unpin-group')"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
        >
          <Pin class="w-4 h-4" />
          Unpin Group
        </ContextMenuItem>

        <ContextMenuItem
          v-else
          @select="$emit('pin-group')"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
        >
          <Pin class="w-4 h-4" />
          Pin Group
        </ContextMenuItem>

        <ContextMenuSeparator class="h-px my-1 bg-neutral-700" />

        <ContextMenuItem
          @select="$emit('delete')"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-red-400 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
        >
          <Trash2 class="w-4 h-4" />
          Delete Group
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import {
  ChevronRight,
  MoreHorizontal,
  Edit2,
  Palette,
  FolderOpen,
  XCircle,
  Trash2,
  Pin
} from 'lucide-vue-next'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from 'reka-ui'
import type { TabGroupColor } from '../state'

const props = defineProps<{
  name: string
  color: TabGroupColor
  isCollapsed: boolean
  tabCount: number
  groupId: string
  isPinned?: boolean
  isDragOver?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  rename: [name: string]
  'change-color': [color: TabGroupColor]
  'ungroup-all': []
  'close-all': []
  delete: []
  'pin-group': []
  'unpin-group': []
  'group-drag-over': [event: DragEvent]
  'group-drag-leave': [event: DragEvent]
  'group-drop': [event: DragEvent]
}>()

const colors: TabGroupColor[] = ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'teal', 'gray']

// Inline editing
const isEditing = ref(false)
const editedName = ref(props.name)
const nameInput = ref<HTMLInputElement | null>(null)

const startEdit = () => {
  isEditing.value = true
  editedName.value = props.name
  nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}

const saveEdit = () => {
  if (editedName.value.trim() && editedName.value !== props.name) {
    emit('rename', editedName.value.trim())
  }
  isEditing.value = false
}

const cancelEdit = () => {
  editedName.value = props.name
  isEditing.value = false
}

// Drag handlers
const handleDragOver = (event: DragEvent) => {
  emit('group-drag-over', event)
}

const handleDragLeave = (event: DragEvent) => {
  emit('group-drag-leave', event)
}

const handleDrop = (event: DragEvent) => {
  emit('group-drop', event)
}
</script>

<style scoped>
.group-label:hover .opacity-0 {
  opacity: 1;
}

.group-label:hover .group-label-hover\:text-neutral-200 {
  color: rgb(229, 229, 229);
}

/* Custom CSS variables for colors */
:root {
  --color-blue: rgb(59, 130, 246);
  --color-purple: rgb(147, 51, 234);
  --color-pink: rgb(236, 72, 153);
  --color-red: rgb(239, 68, 68);
  --color-orange: rgb(249, 115, 22);
  --color-yellow: rgb(234, 179, 8);
  --color-green: rgb(34, 197, 94);
  --color-teal: rgb(20, 184, 166);
  --color-gray: rgb(156, 163, 175);
}
</style>
