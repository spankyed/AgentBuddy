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
        @dragover="$emit('group-drag-over', $event)"
        @dragleave="$emit('group-drag-leave', $event)"
        @drop.prevent.stop="$emit('group-drop', $event)"
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

        <!-- Dropdown menu trigger button -->
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <button
              @click.stop
              class="flex items-center justify-center w-4 h-4 transition-opacity rounded-sm hover:bg-neutral-700/50"
            >
              <MoreHorizontal class="w-3 h-3 text-neutral-400" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuPortal>
            <DropdownMenuContent class="min-w-[180px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
              <GroupMenuItems
                :isPinned="isPinned"
                :ItemComponent="DropdownMenuItem"
                :SeparatorComponent="DropdownMenuSeparator"
                :SubComponent="DropdownMenuSub"
                :SubTriggerComponent="DropdownMenuSubTrigger"
                :SubContentComponent="DropdownMenuSubContent"
                :PortalComponent="DropdownMenuPortal"
                @rename="startEdit"
                @change-color="$emit('change-color', $event)"
                @ungroup-all="$emit('ungroup-all')"
                @close-all="$emit('close-all')"
                @delete="$emit('delete')"
                @pin-group="$emit('pin-group')"
                @unpin-group="$emit('unpin-group')"
              />
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent class="min-w-[180px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
        <GroupMenuItems
          :isPinned="isPinned"
          :ItemComponent="ContextMenuItem"
          :SeparatorComponent="ContextMenuSeparator"
          :SubComponent="ContextMenuSub"
          :SubTriggerComponent="ContextMenuSubTrigger"
          :SubContentComponent="ContextMenuSubContent"
          :PortalComponent="ContextMenuPortal"
          @rename="startEdit"
          @change-color="$emit('change-color', $event)"
          @ungroup-all="$emit('ungroup-all')"
          @close-all="$emit('close-all')"
          @delete="$emit('delete')"
          @pin-group="$emit('pin-group')"
          @unpin-group="$emit('unpin-group')"
        />
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { MoreHorizontal } from 'lucide-vue-next'
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
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from 'reka-ui'
import type { TabGroupColor } from '../state'
import GroupMenuItems from './GroupMenuItems.vue'

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

</script>

<style scoped>
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
