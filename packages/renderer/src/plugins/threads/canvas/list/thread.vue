<template>
  <div
    :class="[
      'flex w-full items-center justify-between overflow-hidden rounded-md bg-neutral-800 border border-neutral-700 transition-all duration-200',
      { 'cursor-pointer hover:bg-neutral-700 hover:border-neutral-600': !lite },
      { 'animate-highlight': !lite && thread.isNew },
    ]"
  >
    <div
      :class="[
        'flex items-center flex-1 h-full px-4 py-3 gap-4',
        { 'cursor-pointer': !lite }
      ]"
      @click="$emit('select', thread.id)"
    >
      <!-- ID badge and truncated topic -->
      <div class="flex items-center flex-1 gap-3">
        <span class="text-xs font-medium text-neutral-500 uppercase tracking-wider min-w-[3.5rem]">
          {{ thread.shortCode }}
        </span>
        <div class="flex items-center gap-3 flex-1">
          <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-700 transition-colors">
            <MessageCircleMore class="w-4 h-4 text-neutral-400" />
          </div>
          <span class="max-w-md text-sm font-medium truncate text-neutral-100">
            {{ thread.topic || 'Untitled thread' }}
          </span>
        </div>
      </div>
      <!-- Status selector and tags -->
      <div v-if="!lite" class="flex items-center gap-4">
        <select
          @click.stop
          :value="thread.status"
          @change="(e) => $emit('status-change', thread.id, (e.target as HTMLSelectElement).value as ThreadEntity['status'])"
          class="px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer bg-neutral-700 border border-neutral-600 text-neutral-300 hover:bg-neutral-600 focus:outline-none focus:border-neutral-500 transition-all duration-200 appearance-none"
        >
          <option value="backlog" class="bg-neutral-700 text-neutral-300">Backlog</option>
          <option value="open" class="bg-neutral-700 text-neutral-300">Open</option>
          <option value="in-progress" class="bg-neutral-700 text-neutral-300">In Progress</option>
          <option value="in-review" class="bg-neutral-700 text-neutral-300">In Review</option>
          <option value="done" class="bg-neutral-700 text-neutral-300">Done</option>
        </select>
        <div class="flex gap-2 overflow-hidden max-w-[12rem]">
          <span
            @click.stop
            v-for="(tag, index) in thread.tags"
            :key="index"
            class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 transition-colors duration-200 truncate"
          >
            {{ tag }}
          </span>
        </div>
      </div>
    </div>

    <button
      v-if="!lite"
      @click.stop="$emit('chat-click', thread.id)"
      type="button"
      class="flex items-center justify-center h-full px-4 py-2.5 text-sm font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700 transition-all duration-200 border-l border-neutral-700"
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
import type { ThreadEntity } from '@app/api';

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
</style>