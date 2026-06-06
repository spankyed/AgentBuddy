<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <div
        class="flex items-center gap-2 pl-3 pr-3 py-1.5 cursor-pointer transition-colors group"
        :class="isActive ? 'bg-blue-500/15 text-white' : 'hover:bg-neutral-800 text-neutral-300 hover:text-white'"
        @click="emit('select')"
      >
        <span class="shrink-0 relative inline-block w-1.5 h-1.5">
          <span class="block w-full h-full rounded-full transition-colors" :class="isBusy ? 'mosaic-dot' : ''" :style="!isBusy ? { backgroundColor: dotColor || '#525252' } : undefined" />
          <span v-if="isBusy" class="absolute inset-0 rounded-full scale-[2] mosaic-glow" />
        </span>
        <span class="flex-1 min-w-0 truncate text-sm">{{ thread.topic || 'Untitled' }}</span>
        <Pin v-if="isPinned" :size="10" class="shrink-0 text-blue-400/60" />
      </div>
    </ContextMenuTrigger>
    <ThreadContextMenu
      :is-pinned="isPinned" :is-archived="false" :copy-text="thread.shortCode || thread.id"
      @rename="emit('rename')" @pin="emit('pin')" @unpin="emit('unpin')"
      @archive="emit('archive')" @delete="emit('delete')"
    >
      <template #before="{ itemClass }">
        <template v-if="groupId">
          <ContextMenuItem :class="itemClass" @select="emit('remove-from-group')">
            <FolderMinus :size="14" class="text-neutral-400" />
            Remove from Group
          </ContextMenuItem>
        </template>
        <template v-else>
          <ContextMenuSub v-if="tabGroups.length > 0">
            <ContextMenuSubTrigger :class="itemClass">
              <FolderPlus :size="14" class="text-neutral-400" />
              Add to Group
              <ChevronRight :size="12" class="ml-auto text-neutral-500" />
            </ContextMenuSubTrigger>
            <ContextMenuPortal>
              <ContextMenuSubContent class="min-w-[140px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
                <ContextMenuItem
                  v-for="group in tabGroups"
                  :key="group.id"
                  :class="itemClass"
                  @select="emit('add-to-group', group.id)"
                >
                  <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: `var(--color-${group.color})` }" />
                  {{ group.name }}
                </ContextMenuItem>
                <ContextMenuSeparator class="h-px bg-neutral-700 my-1" />
                <ContextMenuItem :class="itemClass" @select="emit('create-group')">
                  <FolderPlus :size="14" class="text-blue-400" />
                  New Group
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuPortal>
          </ContextMenuSub>
          <ContextMenuItem v-else :class="itemClass" @select="emit('create-group')">
            <FolderPlus :size="14" class="text-blue-400" />
            Add to New Group
          </ContextMenuItem>
        </template>
        <ContextMenuSeparator class="h-px bg-neutral-700 my-1" />
      </template>
    </ThreadContextMenu>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { Pin, FolderPlus, FolderMinus, ChevronRight } from 'lucide-vue-next'
import {
  ContextMenuRoot, ContextMenuTrigger, ContextMenuItem,
  ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger,
  ContextMenuSubContent, ContextMenuPortal,
} from 'reka-ui'
import ThreadContextMenu from '@/plugins/threads/canvas/components/thread-context-menu.vue'
import type { ThreadListItem } from '@/plugins/threads/state'
import type { ThreadTabGroup } from '@/plugins/threads/canvas/agent/tabs/types'

defineProps<{
  thread: ThreadListItem
  isActive: boolean
  isPinned: boolean
  dotColor: string | undefined
  isBusy: boolean
  groupId: string | undefined
  tabGroups: ThreadTabGroup[]
}>()

const emit = defineEmits<{
  select: []
  rename: []
  pin: []
  unpin: []
  archive: []
  delete: []
  'add-to-group': [groupId: string]
  'remove-from-group': []
  'create-group': []
}>()
</script>
