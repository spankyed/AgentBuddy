<template>
  <div
    :class="[
      'flex w-full items-center justify-between overflow-hidden rounded-md bg-neutral-900/40 border border-neutral-800/50 transition-all duration-200',
      { 'cursor-pointer hover:bg-neutral-900/60 hover:border-neutral-700/50': !lite },
      { 'animate-highlight': !lite && thread.isNew },
    ]"
  >
    <div
      :class="[
        'flex items-center flex-1 h-full px-4 py-2.5 gap-4',
        { 'cursor-pointer': !lite }
      ]"
      @click="$emit('select', thread.id)"
    >
      <!-- ID badge and truncated topic -->
      <div class="flex items-center flex-1 gap-3">
        <span class="text-xs font-medium text-neutral-500 uppercase tracking-wider min-w-[3.5rem]">
          {{ thread.shortCode }}
        </span>
        <span class="text-sm font-medium truncate max-w-md text-neutral-100">
          {{ thread.topic || 'Untitled thread' }}
        </span>
      </div>
      <!-- Status selector and tags -->
      <div v-if="!lite" class="flex items-center gap-4">
        <select
          @click.stop
          :value="thread.status"
          @change="(e) => $emit('status-change', thread.id, (e.target as HTMLSelectElement).value as ThreadEntity['status'])"
          class="px-3 py-1 text-xs rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300 focus:outline-none focus:border-neutral-600 transition-all duration-200 cursor-pointer"
        >
          <option value="draft">Draft</option>
          <option value="queued">Queued</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div class="flex gap-2 overflow-hidden max-w-[12rem]">
          <span
            @click.stop
            v-for="tag in thread.tags"
            :key="tag.id"
            class="px-2 py-0.5 text-xs text-purple-300 rounded bg-purple-900/30 transition-colors duration-200 truncate"
          >
            {{ tag.name }}
          </span>
        </div>
      </div>
    </div>

    <button
      v-if="!lite"
      @click.stop="$emit('chat-click', thread.id)"
      type="button"
      class="flex items-center justify-center h-full px-4 py-2.5 text-sm font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 transition-all duration-200 border-l border-neutral-800"
    >
      Chat
      <MessageCircleMore class="w-4 h-4 ml-1.5"/>
    </button>
  </div>
</template>

<script lang="ts">
export default {
  name: 'Thread'
}
</script>

<script setup lang="ts">
import { MessageCircleMore } from 'lucide-vue-next'
import type { ThreadListItem } from '@/plugins/threads/state';
import type { ThreadEntity } from '@abuddy/api';

defineProps<{
  lite?: boolean;
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
    background-color: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.5);
  }
  100% {
    background-color: rgba(23, 23, 23, 0.4);
    border-color: rgba(38, 38, 38, 0.5);
  }
}

.animate-highlight {
  animation: highlight 2s ease-out forwards;
}
</style>