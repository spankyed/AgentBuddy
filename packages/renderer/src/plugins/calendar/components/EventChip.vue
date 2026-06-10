<template>
  <button
    class="flex items-center gap-1 w-full px-1 py-px rounded text-left text-[11px] truncate"
    :class="event.allDay
      ? 'bg-blue-600/30 text-blue-300 hover:bg-blue-600/40'
      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'"
    :title="event.title"
  >
    <span v-if="!event.allDay" class="text-neutral-500 shrink-0">{{ timeLabel }}</span>
    <span class="truncate">{{ event.title }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CalendarEventDTO } from '@app/api';

const props = defineProps<{
  event: CalendarEventDTO;
}>();

const timeLabel = computed(() =>
  new Date(props.event.startsAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
);
</script>
