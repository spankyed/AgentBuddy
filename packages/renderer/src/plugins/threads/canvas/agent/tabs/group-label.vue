<template>
  <ContextMenuRoot v-model:open="contextMenuOpen">
    <ContextMenuTrigger as-child>
      <div
        class="flex items-center gap-1.5 px-2 h-[30px] cursor-pointer group-label flex-shrink-0 transition-all hover:brightness-110"
        :style="{
          backgroundColor: (isDragOver || !isCollapsed) ? `var(--color-${color})` : `color-mix(in srgb, var(--color-${color}) 10%, transparent)`,
          borderBottom: !isCollapsed ? `2px solid var(--color-${color})` : 'none',
          '--text-color': (isDragOver || !isCollapsed) ? `var(--color-${color}-text)` : 'rgb(156, 163, 175)'
        }"
        :data-group-id="groupId"
        @click.stop="$emit('toggle')"
        @dragover="$emit('group-drag-over', $event)"
        @dragleave="$emit('group-drag-leave', $event)"
        @drop.prevent.stop="$emit('group-drop', $event)"
      >
        <!-- Group name -->
        <span class="text-xs font-medium whitespace-nowrap select-none group-label-text">
          {{ name }}
        </span>

        <!-- Pin icon (shown when group is pinned) -->
        <Pin
          v-if="isPinned"
          class="w-3 h-3 ml-0.5 cursor-pointer transition-colors"
          @click.stop="$emit('unpin-group')"
          title="Click to unpin group"
        />

        <!-- Dropdown menu trigger button -->
        <DropdownMenuRoot v-model:open="dropdownOpen">
          <DropdownMenuTrigger as-child>
            <button
              @click.stop
              class="flex items-center justify-center w-4 h-4 transition-opacity rounded-sm hover:bg-neutral-700/50"
            >
              <MoreHorizontal class="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuPortal>
            <DropdownMenuContent class="min-w-[180px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
              <GroupMenuItems
                :name="name"
                :isPinned="isPinned"
                :ItemComponent="DropdownMenuItem"
                :SeparatorComponent="DropdownMenuSeparator"
                :SubComponent="DropdownMenuSub"
                :SubTriggerComponent="DropdownMenuSubTrigger"
                :SubContentComponent="DropdownMenuSubContent"
                :PortalComponent="DropdownMenuPortal"
                @rename="$emit('rename', $event)"
                @change-color="$emit('change-color', $event)"
                @ungroup-all="$emit('ungroup-all')"
                @close-all="$emit('close-all')"
                @pin-group="$emit('pin-group')"
                @unpin-group="$emit('unpin-group')"
                @request-close="closeMenus"
              />
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent class="min-w-[180px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
        <GroupMenuItems
          :name="name"
          :isPinned="isPinned"
          :ItemComponent="ContextMenuItem"
          :SeparatorComponent="ContextMenuSeparator"
          :SubComponent="ContextMenuSub"
          :SubTriggerComponent="ContextMenuSubTrigger"
          :SubContentComponent="ContextMenuSubContent"
          :PortalComponent="ContextMenuPortal"
          @rename="$emit('rename', $event)"
          @change-color="$emit('change-color', $event)"
          @ungroup-all="$emit('ungroup-all')"
          @close-all="$emit('close-all')"
          @pin-group="$emit('pin-group')"
          @unpin-group="$emit('unpin-group')"
          @request-close="closeMenus"
        />
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { MoreHorizontal, Pin } from 'lucide-vue-next'
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
import type { TabGroupColor } from './types'
import GroupMenuItems from './group-menu-items.vue'

const props = defineProps<{
  name: string
  color: TabGroupColor
  isCollapsed: boolean
  tabCount: number
  groupId: string
  isPinned?: boolean
  isDragOver?: boolean
  autoEdit?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  rename: [name: string]
  'change-color': [color: TabGroupColor]
  'ungroup-all': []
  'close-all': []
  'pin-group': []
  'unpin-group': []
  'group-drag-over': [event: DragEvent]
  'group-drag-leave': [event: DragEvent]
  'group-drop': [event: DragEvent]
  'edit-started': []
}>()

const dropdownOpen = ref(false)
const contextMenuOpen = ref(false)

watch(() => props.autoEdit, (val) => {
  if (val) {
    nextTick(() => {
      dropdownOpen.value = true
      emit('edit-started')
    })
  }
})

const closeMenus = () => {
  dropdownOpen.value = false
  contextMenuOpen.value = false
}
</script>

<style scoped>
.group-label-text,
.group-label .w-3.h-3 {
  color: var(--text-color);
}
</style>
