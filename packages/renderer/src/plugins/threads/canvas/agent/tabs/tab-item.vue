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
        <!-- Dot / Close button swap container (non-pinned tabs) -->
        <span v-if="!isPinned" class="relative flex items-center justify-center w-[22px] h-[22px] mr-1 shrink-0">
          <!-- State dot (default, hides on hover) -->
          <span class="group-hover:opacity-0 transition-opacity relative inline-block w-1.5 h-1.5">
            <span
              class="block w-full h-full rounded-full transition-colors"
              :class="isThreadBusy(tab.id) ? 'mosaic-dot' : ''"
              :style="!isThreadBusy(tab.id) ? { backgroundColor: getThreadDotColor(tab.id) || '#525252' } : undefined"
            />
            <span
              v-if="isThreadBusy(tab.id)"
              class="absolute inset-0 rounded-full scale-[2]"
              :class="'mosaic-glow'"
            />
          </span>
          <!-- Close X (hidden, shows on hover) -->
          <button
            class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-neutral-700"
            @click.stop="$emit('close')"
          >
            <X :size="14" />
          </button>
        </span>
        <!-- Pinned tabs: dot only -->
        <span v-else class="shrink-0 relative inline-block w-1.5 h-1.5 mr-1.5">
          <span
            class="block w-full h-full rounded-full transition-colors"
            :class="isThreadBusy(tab.id) ? 'mosaic-dot' : ''"
            :style="!isThreadBusy(tab.id) ? { backgroundColor: getThreadDotColor(tab.id) || '#525252' } : undefined"
          />
          <span
            v-if="isThreadBusy(tab.id)"
            class="absolute inset-0 rounded-full scale-[2] mosaic-glow"
          />
        </span>
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

        <ContextMenuItem
          v-if="isPinned"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
          @select="$emit('unpin-thread')"
        >
          <Pin class="w-4 h-4" />
          Unpin Thread
        </ContextMenuItem>

        <ContextMenuItem
          v-if="!isPinned"
          class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
          @select="$emit('pin-thread')"
        >
          <Pin class="w-4 h-4" />
          Pin Thread
        </ContextMenuItem>

        <ContextMenuSeparator v-if="!isPinned" class="h-px bg-neutral-700" />

        <ContextMenuItem
          v-if="!isPinned"
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
import { X, MessageSquare, Pin, Trash2 } from 'lucide-vue-next';
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuPortal,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from 'reka-ui';
import type { Tab } from '@app/api';
import { applicationState } from '@/main';
import { useSelector } from '@xstate/vue';
import { id as threadsId, type ThreadsState } from '@/plugins/threads/state';

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
  'unpin-thread': [];
  'pin-thread': [];
}>();

const threadsActor: ThreadsState = applicationState.system.get(threadsId);
const chatStates = useSelector(threadsActor, (state) => state.context.chatStates);
const chatStateOverrides = useSelector(threadsActor, (state) => state.context.chatStateOverrides);
const settings = useSelector(threadsActor, (state) => state.context.settings);

function getThreadStateConfig(threadId: string) {
  const override = chatStateOverrides.value[threadId];
  const activeStateId = (override && override.expiresAt > Date.now())
    ? override.id
    : (chatStates.value[threadId] || 'idle');
  return settings.value?.chatStates?.find(c => c.id === activeStateId);
}

function getThreadDotColor(threadId: string): string | undefined {
  return getThreadStateConfig(threadId)?.color;
}

function isThreadBusy(threadId: string): boolean {
  return getThreadStateConfig(threadId)?.busy ?? false;
}
</script>
