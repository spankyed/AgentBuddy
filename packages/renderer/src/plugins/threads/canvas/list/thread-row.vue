<template>
  <tr
    :class="[
      'transition-all duration-200 cursor-pointer group hover:bg-neutral-800',
      { 'animate-highlight': thread.isNew }
    ]"
    @click="$emit('select', thread.id)"
  >
    <td class="px-6 py-2">
      <div class="flex items-center gap-3">
        <span class="font-medium text-neutral-100 line-clamp-1" :title="thread.topic || 'Untitled thread'">
          {{ thread.topic || 'Untitled thread' }}
        </span>
        <span class="text-xs font-medium tracking-wider uppercase text-neutral-500">
          ({{ thread.shortCode || '---' }})
        </span>
      </div>
    </td>
    <td class="px-4 py-2">
      <div class="flex items-center gap-2">
        <span
          v-for="(tag, index) in (thread.tags || []).slice(0, 3)"
          :key="index"
          :style="getTagStyles(tag)"
          class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md truncate max-w-[6rem]"
        >
          {{ tag }}
        </span>
        <span v-if="thread.tags && thread.tags.length > 3" class="px-2 py-0.5 text-xs text-neutral-400">
          +{{ thread.tags.length - 3 }} more
        </span>
      </div>
    </td>
    <td class="px-4 py-2">
      <select
        data-onboarding-id="thread-status"
        @click.stop
        :value="thread.status"
        @change="(e) => $emit('status-change', thread.id, (e.target as HTMLSelectElement).value)"
        class="px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 focus:outline-none focus:border-neutral-600 transition-all duration-200 appearance-none"
      >
        <option 
          v-for="status in (settings?.statuses || [])" 
          :key="status.label"
          :value="status.label"
          class="bg-neutral-800 text-neutral-300"
        >
          {{ status.label }}
        </option>
      </select>
    </td>
    <td class="px-4 py-2">
      <div class="flex items-center justify-end gap-2">
        <button
          data-onboarding-id="thread-actions"
          @click.stop="$emit('chat-click', thread.id)"
          type="button"
          class="p-1.5 flex items-center text-neutral-400 transition-all duration-200 rounded-md hover:text-blue-400 hover:bg-blue-400/10 active:scale-95"
          aria-label="Open chat"
          title="Open in chat"
        >
          <MessageCircleMore class="ml-2 w-4 h-4"/>
        </button>
        <button
          @click.stop="$emit('delete-click', thread.id)"
          type="button"
          class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-red-400 hover:bg-red-400/10 active:scale-95"
          aria-label="Delete thread"
          title="Delete thread"
        >
          <Trash2 class="w-4 h-4"/>
        </button>
      </div>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { MessageCircleMore, Trash2 } from 'lucide-vue-next'
import type { ThreadListItem } from '@/plugins/threads/state';
import type { ThreadTagOption, ThreadsSettings } from '@app/api';

const props = defineProps<{
  thread: ThreadListItem;
  availableTags?: ThreadTagOption[];
  settings?: ThreadsSettings | null;
}>();

defineEmits<{
  select: [id: string]
  'status-change': [id: string, status: string]
  'chat-click': [id: string]
  'delete-click': [id: string]
}>();

const getTagStyles = (tagName: string) => {
  const color = props.availableTags?.find(t => t.name === tagName)?.color || '#A855F7';
  return {
    backgroundColor: `${color}1A`, // 10% opacity
    color,
    border: `1px solid ${color}33` // 20% opacity for border
  };
};
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