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
        <span class="shrink-0 relative inline-block w-1.5 h-1.5 ml-1.5">
          <span
            class="block w-full h-full rounded-full transition-colors"
            :class="isThreadBusy(tab.id) ? $style['mosaic-dot'] : ''"
            :style="!isThreadBusy(tab.id) ? { backgroundColor: getThreadDotColor(tab.id) || '#525252' } : undefined"
          />
          <span
            v-if="isThreadBusy(tab.id)"
            class="absolute inset-0 rounded-full scale-[2]"
            :class="$style['mosaic-glow']"
          />
        </span>
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

<style lang="scss" module>
.mosaic-dot {
  background: conic-gradient(
    from var(--thinking-angle, 0deg),
    #facc15,
    #a855f7,
    #3b82f6,
    #facc15
  );
  animation: thinking-rotate 3s linear infinite;
  filter: saturate(1.5) brightness(1.2);
}

.mosaic-glow {
  background: conic-gradient(
    from var(--thinking-angle, 0deg),
    #facc15,
    #a855f7,
    #3b82f6,
    #facc15
  );
  animation: thinking-rotate 3s linear infinite;
  filter: blur(3px) saturate(2) brightness(1.3);
  opacity: 0.7;
}

@keyframes thinking-rotate {
  to {
    --thinking-angle: 360deg;
  }
}
</style>

<style>
@property --thinking-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
</style>
