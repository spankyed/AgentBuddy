<template>
  <div class="flex flex-col">
    <!-- Weekday header -->
    <div class="grid grid-cols-7 border-b border-neutral-800">
      <div
        v-for="day in weekdays"
        :key="day"
        class="px-2.5 py-1.5 text-xs font-medium text-neutral-500 text-right"
      >
        {{ day }}
      </div>
    </div>

    <!-- Day cells -->
    <div ref="gridEl" class="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
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
            v-for="event in cell.events.slice(0, visibleCount(cell.events.length))"
            :key="event.id"
            :event="event"
            class="shrink-0"
            @click.stop="emit('event-click', event.id)"
          />
          <span
            v-if="cell.events.length > visibleCount(cell.events.length)"
            class="text-[10px] text-neutral-500 px-1 shrink-0 truncate"
          >
            {{ cell.events.length - visibleCount(cell.events.length) }} more event{{ cell.events.length - visibleCount(cell.events.length) === 1 ? '' : 's' }}…
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
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

// Adaptive chip capacity: measure the grid and compute how many full chips fit per cell
const CHIP_ROW = 20;    // chip height + gap
const CELL_CHROME = 32; // day-number row + cell padding

const gridEl = ref<HTMLElement | null>(null);
const cellHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    cellHeight.value = entry.contentRect.height / 6;
  });
  if (gridEl.value) resizeObserver.observe(gridEl.value);
});

onBeforeUnmount(() => resizeObserver?.disconnect());

const rowCapacity = computed(() =>
  Math.max(0, Math.floor((cellHeight.value - CELL_CHROME) / CHIP_ROW))
);

// When events overflow, the "N more events" line takes one of the rows
function visibleCount(total: number): number {
  const capacity = rowCapacity.value;
  return total <= capacity ? total : Math.max(0, capacity - 1);
}

const cells = computed(() => {
  const first = new Date(props.year, props.month, 1);
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();

  return Array.from({ length: 42 }, (_, i) => {
    const offset = 1 - first.getDay() + i;
    const date = new Date(props.year, props.month, offset);
    const dayStart = date.getTime();
    // Construct via Date parts so DST-transition days (23h/25h) get correct boundaries
    const dayEnd = new Date(props.year, props.month, offset + 1).getTime();

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
