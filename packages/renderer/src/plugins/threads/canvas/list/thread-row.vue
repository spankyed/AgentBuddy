<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <BaseThreadRow
        :thread="thread"
        :available-tags="availableTags"
        :settings="settings"
        :chat-states="chatStates"
        :chat-state-overrides="chatStateOverrides"
        :class="[
          'cursor-pointer group thread-row',
          { 'animate-highlight': thread.isNew },
          { 'selected': isSelected },
          dragClass,
        ]"
        @click="handleRowClick"
        @select="$emit('select', thread.id)"
        @status-change="(id, status) => $emit('status-change', id, status)"
        @drag-start="(e, id) => $emit('drag-start', e, id)"
        @drag-over="(e, id) => $emit('drag-over', e, id)"
        @drag-leave="(e) => $emit('drag-leave', e)"
        @drop="(e, id) => $emit('drop', e, id)"
      >
        <template #actions>
          <td class="px-6 py-1.5">
            <div class="flex items-center justify-end gap-2">
              <button
                v-if="thread.pinned"
                @click.stop="$emit('unpin-click', thread.id)"
                type="button"
                class="p-1.5 text-blue-400 transition-all duration-200 rounded-md hover:text-blue-300 hover:bg-blue-400/10 active:scale-95"
                aria-label="Unpin thread"
                title="Unpin thread"
              >
                <Pin class="w-4 h-4"/>
              </button>
              <button
                v-if="!thread.pinned"
                @click.stop="$emit('pin-click', thread.id)"
                type="button"
                class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-blue-400 hover:bg-blue-400/10 active:scale-95 opacity-0 group-hover:opacity-100"
                aria-label="Pin thread"
                title="Pin thread"
              >
                <Pin class="w-4 h-4"/>
              </button>
              <button
                v-if="settings?.clickToChat"
                data-onboarding-id="thread-actions"
                @click.stop="$emit('select', thread.id)"
                type="button"
                class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-blue-400 hover:bg-blue-400/10 active:scale-95"
                aria-label="Edit details"
                title="Edit details"
              >
                <SquarePen class="w-4 h-4"/>
              </button>
              <button
                v-else
                data-onboarding-id="thread-actions"
                @click.stop="$emit('chat-click', thread.id)"
                type="button"
                class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-blue-400 hover:bg-blue-400/10 active:scale-95"
                aria-label="View chat"
                title="View chat"
              >
                <MessageCircleMore class="w-4 h-4"/>
              </button>
              <div v-if="thread.pinned" class="w-[28px]" />
              <ContextMenuRoot v-else>
                <ContextMenuTrigger as-child>
                  <button
                    @click.stop="$emit('archive-click', thread.id)"
                    type="button"
                    class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-amber-400 hover:bg-amber-400/10 active:scale-95"
                    aria-label="Archive thread"
                    title="Archive thread (right-click for more)"
                  >
                    <Archive class="w-4 h-4"/>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuPortal>
                  <ContextMenuContent
                    class="bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[120px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)] z-50"
                    :side-offset="2"
                  >
                    <ContextMenuItem
                      class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-red-400 hover:bg-neutral-700 transition-colors outline-none"
                      @select="$emit('delete-click', thread.id)"
                    >
                      <Trash2 :size="14" />
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuPortal>
              </ContextMenuRoot>
            </div>
          </td>
        </template>
      </BaseThreadRow>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent
        class="bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[160px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)] z-50"
        :side-offset="2"
      >
        <ContextMenuItem
          v-if="settings?.clickToChat"
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors outline-none"
          @select="$emit('select', thread.id)"
        >
          <SquarePen :size="14" class="text-blue-400" />
          Edit Details
        </ContextMenuItem>
        <ContextMenuItem
          v-else
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors outline-none"
          @select="$emit('chat-click', thread.id)"
        >
          <MessageCircleMore :size="14" class="text-blue-400" />
          Chat
        </ContextMenuItem>
        <ContextMenuItem
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors outline-none"
          @select="$emit('chat-click', thread.id)"
        >
          <PanelLeft :size="14" class="text-neutral-400" />
          Open in Dashboard
        </ContextMenuItem>
        <ContextMenuItem
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors outline-none"
          @select="copyId"
        >
          <Copy :size="14" class="text-neutral-400" />
          Copy Id
        </ContextMenuItem>
        <template v-if="thread.pinned">
          <ContextMenuSeparator class="h-px bg-neutral-700 my-1" />
          <ContextMenuItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors outline-none"
            @select="$emit('unpin-click', thread.id)"
          >
            <Pin :size="14" class="text-neutral-400" />
            Unpin
          </ContextMenuItem>
        </template>
        <template v-if="!thread.pinned">
          <ContextMenuSeparator class="h-px bg-neutral-700 my-1" />
          <ContextMenuItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors outline-none"
            @select="$emit('pin-click', thread.id)"
          >
            <Pin :size="14" class="text-neutral-400" />
            Pin
          </ContextMenuItem>
          <ContextMenuItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors outline-none"
            @select="$emit('archive-click', thread.id)"
          >
            <Archive :size="14" class="text-amber-400" />
            Archive
          </ContextMenuItem>
          <ContextMenuItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-red-400 hover:bg-neutral-700 transition-colors outline-none"
            @select="$emit('delete-click', thread.id)"
          >
            <Trash2 :size="14" />
            Delete
          </ContextMenuItem>
        </template>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { Archive, Copy, MessageCircleMore, PanelLeft, Pin, SquarePen, Trash2 } from 'lucide-vue-next'
import {
  ContextMenuContent, ContextMenuItem, ContextMenuPortal,
  ContextMenuRoot, ContextMenuSeparator, ContextMenuTrigger,
} from 'reka-ui'
import type { ThreadListItem } from '@/plugins/threads/state';
import type { ThreadTagOption, ThreadsSettings } from '@app/api';
import BaseThreadRow from '../components/base-thread-row.vue';

const props = defineProps<{
  thread: ThreadListItem;
  availableTags?: ThreadTagOption[];
  settings?: ThreadsSettings | null;
  chatStates?: Record<string, string>;
  chatStateOverrides?: Record<string, { id: string; expiresAt: number }>;
  isSelected?: boolean;
  dragClass?: string;
}>();

const emit = defineEmits<{
  select: [id: string]
  'multi-select': [id: string, event: MouseEvent]
  'status-change': [id: string, status: string]
  'chat-click': [id: string]
  'archive-click': [id: string]
  'delete-click': [id: string]
  'unpin-click': [id: string]
  'pin-click': [id: string]
  'drag-start': [e: DragEvent, id: string]
  'drag-over': [e: DragEvent, id: string]
  'drag-leave': [e: DragEvent]
  'drop': [e: DragEvent, id: string]
}>();

function handleRowClick(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    // Modifier key: toggle/range selection only
    emit('multi-select', props.thread.id, event)
  } else {
    // Plain click: navigate (no selection change)
    if (props.settings?.clickToChat) {
      emit('chat-click', props.thread.id)
    } else {
      emit('select', props.thread.id)
    }
  }
}

function copyId() {
  navigator.clipboard.writeText(props.thread.shortCode || props.thread.id)
}
</script>

<style lang="scss">
@keyframes highlight {
  0% {
    background-color: rgba(99, 102, 241, 0.08);
    border-color: rgba(99, 102, 241, 0.3);
  }
  100% {
    background-color: transparent;
    border-color: transparent;
  }
}

.animate-highlight {
  animation: highlight 2s ease-out forwards;
}

tr.thread-row.selected {
  background-color: rgba(255, 255, 255, 0.03);
  box-shadow: inset 3px 0 0 0 rgba(139, 92, 246, 0.7); /* left accent bar */
}

tr.thread-row.selected:hover {
  background-color: rgba(255, 255, 255, 0.05);
}
</style>
