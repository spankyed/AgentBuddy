<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <div
        class="relative flex items-center px-4 py-1 text-sm transition-colors cursor-pointer group border-r border-neutral-800 max-w-[200px]"
        :class="[
          isActive
            ? 'bg-neutral-850 text-white border-t border-blue-500'
            : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200'
        ]"
        :title="tab.label"
        @click="$emit('select')"
      >
        <!-- Dot / Close button swap container -->
        <span class="relative flex items-center justify-center w-[22px] h-[22px] mr-1 shrink-0">
          <!-- State dot (default, hides on hover) -->
          <span class="transition-opacity relative inline-block w-1.5 h-1.5" :class="{ 'group-hover:opacity-0': !isPinned }">
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
            v-if="!isPinned"
            class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-neutral-700"
            @click.stop="$emit('close')"
          >
            <X :size="14" />
          </button>
        </span>
        <input
          v-if="isRenaming"
          ref="renameInput"
          v-model="renamingName"
          class="truncate text-sm bg-neutral-800 border border-blue-500 rounded px-1 py-0 outline-none w-full min-w-0"
          @keydown.enter="confirmRename"
          @keydown.escape="cancelRename"
          @blur="confirmRename"
          @click.stop
        />
        <span v-else class="truncate">{{ tab.label }}</span>
        <Pin
          :size="12"
          class="shrink-0 ml-1.5 cursor-pointer transition-opacity"
          :class="isPinned
            ? 'text-blue-400 hover:text-blue-300'
            : 'text-neutral-500 hover:text-neutral-300 opacity-0 group-hover:opacity-100'"
          @click.stop="isPinned ? $emit('unpin-thread') : $emit('pin-thread')"
        />
      </div>
    </ContextMenuTrigger>

    <ThreadContextMenu
      :is-pinned="isPinned"
      :copy-text="tab.id"
      @rename="handleRename"
      @pin="$emit('pin-thread')"
      @unpin="$emit('unpin-thread')"
      @archive="$emit('archive-thread')"
      @delete="$emit('delete-thread')"
    >
      <template #before="{ itemClass }">
        <ContextMenuItem v-if="!isPinned" :class="itemClass" @select="$emit('close')">
          <X :size="14" class="text-neutral-400" />
          Close Tab
        </ContextMenuItem>
        <ContextMenuItem :class="itemClass" @select="$emit('edit-details')">
          <SquarePen :size="14" class="text-blue-400" />
          Edit Details
        </ContextMenuItem>
      </template>
    </ThreadContextMenu>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { X, SquarePen, Pin } from 'lucide-vue-next';
import { ContextMenuRoot, ContextMenuTrigger, ContextMenuItem } from 'reka-ui';
import ThreadContextMenu from '@/plugins/threads/canvas/components/thread-context-menu.vue';
import type { Tab } from '@app/api';
import { applicationState } from '@/main';
import { useSelector } from '@xstate/vue';
import { id as threadsId, type ThreadsState } from '@/plugins/threads/state';

const props = defineProps<{
  tab: Tab;
  isActive: boolean;
  isPinned: boolean;
}>();

defineEmits<{
  select: [];
  close: [];
  'edit-details': [];
  'delete-thread': [];
  'unpin-thread': [];
  'pin-thread': [];
  'archive-thread': [];
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

const isRenaming = ref(false)
const renamingName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function handleRename() {
  isRenaming.value = true
  renamingName.value = props.tab.label || ''
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function confirmRename() {
  if (!isRenaming.value) return
  const trimmed = renamingName.value.trim()
  if (trimmed) {
    threadsActor.send({ type: 'RENAME_THREAD', threadId: props.tab.id, topic: trimmed });
  }
  isRenaming.value = false
  renamingName.value = ''
}

function cancelRename() {
  isRenaming.value = false
  renamingName.value = ''
}
</script>
