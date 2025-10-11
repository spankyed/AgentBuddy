<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <div
        class="flex items-center gap-1.5 px-2 py-0 min-h-[2.5rem] cursor-pointer group-label flex-shrink-0 transition-all hover:brightness-110"
        :style="{
          backgroundColor: (isDragOver || !isCollapsed) ? `var(--color-${color})` : `color-mix(in srgb, var(--color-${color}) 10%, transparent)`,
          borderBottom: !isCollapsed ? `2px solid var(--color-${color})` : 'none'
        }"
        :data-group-id="groupId"
        @click.stop="$emit('toggle')"
        @dragover="$emit('group-drag-over', $event)"
        @dragleave="$emit('group-drag-leave', $event)"
        @drop.prevent.stop="$emit('group-drop', $event)"
      >
        <!-- Group name -->
        <span
          class="text-xs font-medium whitespace-nowrap select-none"
          :class="(isDragOver || !isCollapsed) && ['orange', 'yellow', 'pink'].includes(color) ? 'text-neutral-900' : 'text-neutral-300'"
        >
          {{ name }}
        </span>

        <!-- Pin icon (shown when group is pinned) -->
        <Pin
          v-if="isPinned"
          class="w-3 h-3 ml-0.5 cursor-pointer transition-colors"
          :class="(isDragOver || !isCollapsed) && ['orange', 'yellow', 'pink'].includes(color)
            ? 'text-neutral-900 hover:text-neutral-700'
            : 'text-neutral-400 hover:text-neutral-200'"
          @click.stop="$emit('unpin-group')"
          title="Click to unpin group"
        />

        <!-- Dropdown menu trigger button -->
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <button
              @click.stop
              class="flex items-center justify-center w-4 h-4 transition-opacity rounded-sm hover:bg-neutral-700/50"
            >
              <MoreHorizontal
                class="w-3 h-3"
                :class="(isDragOver || !isCollapsed) && ['orange', 'yellow', 'pink'].includes(color) ? 'text-neutral-900' : 'text-neutral-400'"
              />
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
        />
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
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
import type { TabGroupColor } from '../state'
import GroupMenuItems from './GroupMenuItems.vue'

defineProps<{
  name: string
  color: TabGroupColor
  isCollapsed: boolean
  tabCount: number
  groupId: string
  isPinned?: boolean
  isDragOver?: boolean
}>()

defineEmits<{
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
}>()
</script>

<style scoped>
/* Custom CSS variables for colors */
:root {
  --color-blue: rgb(96, 165, 250);
  --color-purple: rgb(168, 85, 247);
  --color-pink: rgb(236, 72, 153);
  --color-red: rgb(248, 113, 113);
  --color-orange: rgb(251, 146, 60);
  --color-yellow: rgb(250, 204, 21);
  --color-green: rgb(74, 222, 128);
  --color-teal: rgb(45, 212, 191);
  --color-gray: rgb(156, 163, 175);
}
</style>
