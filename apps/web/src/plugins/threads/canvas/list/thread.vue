<template>
  <div
    :class="[
      'flex w-full items-center justify-between overflow-hidden rounded-md cursor-pointer bg-neutral-900/80',
      { 'animate-highlight': thread.isNew }
    ]"
  >
    <div class="flex items-center flex-1 h-full px-4 py-2 hover:bg-neutral-800/70" @click="$emit('select', thread.id)">
      <!-- ID badge and truncated topic -->
      <div class="flex items-center flex-1 space-x-2">
        <span class="w-24 px-2 py-1 text-xs font-semibold text-neutral-500">
          {{ thread.shortCode }}
        </span>
        <span class="text-sm truncate max-w-96 text-neutral-200 hover:text-neutral-100">
          {{ thread.topic || 'Untitled thread...' }}
        </span>
      </div>
      <!-- Status selector and tags -->
      <div class="flex items-center space-x-3">
        <select
          @click.stop
          :value="thread.status"
          @change="(e) => $emit('status-change', thread.id, (e.target as HTMLSelectElement).value as ThreadEntity['status'])"
          class="px-2 py-0.5 text-xs rounded bg-neutral-700 text-neutral-200 focus:outline-none"
        >
          <option value="draft">Draft</option>
          <option value="queued">Queued</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
    </div>

    <button
      @click.stop="$emit('chat-click', thread.id)"
      type="button"
      class="flex items-center justify-center h-full px-4 py-2 text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800/70"
    >
      Chat
      <MessageCircleMore :size="16" class="ml-1.5"/>
    </button>
  </div>
</template>

<script setup lang="ts">
import { MessageCircleMore } from 'lucide-vue-next'
import type { ThreadListItem } from '@/plugins/threads/state';
import type { ThreadEntity } from '@abuddy/api';

defineProps<{
  thread: ThreadListItem
}>();

defineEmits<{
  select: [id: string]
  'status-change': [id: string, status: ThreadEntity['status']]
  'chat-click': [id: string]
}>();
</script>

<style lang="scss">
@keyframes highlight {
  0% {
    background-color: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
  }
  100% {
    background-color: rgba(23, 23, 23, 0.8);
    border-color: rgb(38, 38, 38);
  }
}

.animate-highlight {
  animation: highlight 2s ease-out forwards;
}
</style>