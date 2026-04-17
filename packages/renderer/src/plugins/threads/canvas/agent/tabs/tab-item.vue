<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <div
        class="relative flex items-center px-4 py-2 text-sm transition-colors cursor-pointer group border-r border-neutral-800 max-w-[200px]"
        :class="[
          isActive
            ? 'bg-neutral-850 text-white border-t border-blue-500'
            : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200'
        ]"
        :title="tab.label"
        @click="$emit('select')"
      >
        <button
          v-if="!isPinned"
          class="opacity-0 group-hover:opacity-100 transition-opacity mr-1.5 p-0.5 rounded hover:bg-neutral-700"
          @click.stop="$emit('close')"
        >
          <X :size="14" />
        </button>
        <span class="truncate">{{ tab.label }}</span>
      </div>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg z-50">
        <ContextMenuItem
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
          @select="$emit('open-in-chat')"
        >
          <MessageSquare class="w-4 h-4" />
          Open in Chat
        </ContextMenuItem>

        <ContextMenuItem
          v-if="!isPinned"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
          @select="$emit('close')"
        >
          <X class="w-4 h-4" />
          Close Tab
        </ContextMenuItem>

        <ContextMenuSeparator class="h-px bg-neutral-700" />

        <ContextMenuItem
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-red-400 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
          @select="$emit('delete-thread')"
        >
          <Trash2 class="w-4 h-4" />
          Delete Thread
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { X, MessageSquare, Trash2 } from 'lucide-vue-next';
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuPortal,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from 'reka-ui';
import type { Tab } from '@app/api';

defineProps<{
  tab: Tab;
  isActive: boolean;
  isPinned: boolean;
}>();

defineEmits<{
  select: [];
  close: [];
  'open-in-chat': [];
  'delete-thread': [];
}>();
</script>
