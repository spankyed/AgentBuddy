<template>
  <div class="flex flex-col">
    <!-- Weekday header -->
    <div class="grid grid-cols-7 border-b border-neutral-800">
      <div
        v-for="day in weekdays"
        :key="day"
        class="px-2 py-1.5 text-xs font-medium text-neutral-500 text-center"
      >
        {{ day }}
      </div>
    </div>

    <!-- Day cells -->
    <div class="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
      <div
        v-for="cell in cells"
        :key="cell.dateMs"
        class="flex flex-col border-b border-r border-neutral-800 p-1 min-h-0 cursor-pointer hover:bg-neutral-800/50 overflow-hidden"
        :class="cell.inMonth ? '' : 'opacity-40'"
        @click="emit('day-click', cell.dateMs)"
      >
        <div class="flex justify-end">
          <span
            class="text-xs px-1.5 py-0.5 rounded-full"
            :class="cell.isToday ? 'bg-blue-600 text-white font-semibold' : 'text-neutral-400'"
          >
            {{ cell.dayOfMonth }}
          </span>
        </div>
        <div class="flex flex-col gap-0.5 mt-0.5 overflow-hidden">
          <EventChip
            v-for="event in cell.events.slice(0, maxChips)"
            :key="event.id"
            :event="event"
            @click.stop="emit('event-click', event.id)"
          />
          <span
            v-if="cell.events.length > maxChips"
            class="text-[10px] text-neutral-500 px-1"
          >
            +{{ cell.events.length - maxChips }} more
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CalendarEventDTO } from '@app/api';
import EventChip from './EventChip.vue';

const props = defineProps<{
  year: number;
  month: number; // 0-11
  events: CalendarEventDTO[];
}>();

const emit = defineEmits<{
  (e: 'day-click', dateMs: number): void;
  (e: 'event-click', eventId: string): void;
}>();

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const maxChips = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

const cells = computed(() => {
  const first = new Date(props.year, props.month, 1);
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(props.year, props.month, 1 - first.getDay() + i);
    const dayStart = date.getTime();
    const dayEnd = dayStart + DAY_MS;

    const dayEvents = props.events
      .filter(ev => {
        const evEnd = Math.max(ev.endsAt, ev.startsAt + 1);
        return ev.startsAt < dayEnd && evEnd > dayStart;
      })
      .sort((a, b) => (Number(b.allDay) - Number(a.allDay)) || (a.startsAt - b.startsAt));

    return {
      dateMs: dayStart,
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === props.month,
      isToday: dayStart === todayStart,
      events: dayEvents,
    };
  });
});
</script>
