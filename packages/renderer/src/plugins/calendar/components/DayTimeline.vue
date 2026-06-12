<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- All-day row -->
    <div
      v-if="allDayEvents.length"
      class="flex items-start gap-1.5 px-3 py-1.5 border-b border-neutral-800"
    >
      <span class="text-[11px] text-neutral-500 w-12 shrink-0 pt-px">All day</span>
      <div class="flex flex-wrap gap-1 min-w-0">
        <EventChip
          v-for="event in allDayEvents"
          :key="event.id"
          :event="event"
          class="!w-auto max-w-64"
          @click.stop="emit('event-click', event.id)"
        />
      </div>
    </div>

    <!-- Hour grid -->
    <div ref="scrollEl" class="flex-1 overflow-y-auto min-h-0">
      <div class="flex">
        <!-- Hour gutter -->
        <div class="w-16 shrink-0">
          <div v-for="h in 24" :key="h" class="h-12 relative">
            <span
              v-if="h > 1"
              class="absolute -top-[7px] right-2 text-[10px] text-neutral-500 select-none"
            >
              {{ hourLabel(h - 1) }}
            </span>
          </div>
        </div>

        <!-- Track -->
        <div
          class="flex-1 relative border-l border-neutral-800 cursor-pointer"
          @click="onTrackClick"
        >
          <!-- Hour lines -->
          <div
            v-for="h in 24"
            :key="h"
            class="h-12 border-b border-neutral-800/60 pointer-events-none"
          />

          <!-- Event blocks -->
          <button
            v-for="block in blocks"
            :key="block.event.id"
            class="absolute rounded-md bg-blue-600/20 border-l-2 border-blue-500 hover:bg-blue-600/30 text-left px-1.5 py-0.5 overflow-hidden"
            :style="{
              top: `${block.topPx}px`,
              height: `${block.heightPx}px`,
              left: `calc(${(block.col / block.cols) * 100}% + 1px)`,
              width: `calc(${(1 / block.cols) * 100}% - 3px)`,
            }"
            @click.stop="emit('event-click', block.event.id)"
          >
            <div class="text-[11px] font-medium text-blue-200 truncate leading-tight">
              {{ block.event.title }}
            </div>
            <div class="text-[10px] text-blue-300/70 truncate leading-tight">
              {{ block.timeLabel }}
            </div>
          </button>

          <!-- Now indicator -->
          <div
            v-if="nowMin !== null"
            class="absolute left-0 right-0 pointer-events-none z-10"
            :style="{ top: `${nowMin * PX_PER_MIN}px` }"
          >
            <div class="h-px bg-red-500" />
            <div class="absolute -left-1 -top-[3px] size-1.5 rounded-full bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { CalendarEventDTO } from '@app/api';
import EventChip from './EventChip.vue';

const props = defineProps<{
  dayMs: number;
  events: CalendarEventDTO[];
}>();

const emit = defineEmits<{
  (e: 'event-click', eventId: string): void;
  (e: 'slot-click', dateMs: number): void;
}>();

const HOUR_PX = 48;
const PX_PER_MIN = HOUR_PX / 60;
const MIN_BLOCK_PX = 20;
const DAY_MIN = 24 * 60;

const dayBounds = computed(() => {
  const d = new Date(props.dayMs);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return { start, end };
});

const dayEvents = computed(() => {
  const { start, end } = dayBounds.value;
  return props.events.filter(ev => {
    const evEnd = Math.max(ev.endsAt, ev.startsAt + 1);
    return ev.startsAt < end && evEnd > start;
  });
});

const allDayEvents = computed(() => {
  const { start, end } = dayBounds.value;
  return dayEvents.value
    .filter(ev => ev.allDay || (ev.startsAt <= start && ev.endsAt >= end))
    .sort((a, b) => a.startsAt - b.startsAt);
});

function minutesIntoDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

interface Block {
  event: CalendarEventDTO;
  topMin: number;
  topPx: number;
  heightPx: number;
  timeLabel: string;
  col: number;
  cols: number;
}

const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

const blocks = computed<Block[]>(() => {
  const { start, end } = dayBounds.value;
  const allDayIds = new Set(allDayEvents.value.map(e => e.id));

  const items = dayEvents.value
    .filter(ev => !allDayIds.has(ev.id))
    .map(ev => {
      const topMin = ev.startsAt <= start ? 0 : minutesIntoDay(ev.startsAt);
      const endMin = ev.endsAt >= end ? DAY_MIN : Math.max(minutesIntoDay(ev.endsAt), topMin);
      const heightPx = Math.max((endMin - topMin) * PX_PER_MIN, MIN_BLOCK_PX);
      // Keep min-height blocks near midnight inside the 24h track
      const topPx = Math.min(topMin * PX_PER_MIN, DAY_MIN * PX_PER_MIN - heightPx);
      // Effective end used for overlap math so min-height blocks don't visually collide
      const effectiveEndMin = Math.max(endMin, topMin + MIN_BLOCK_PX / PX_PER_MIN);
      const timeLabel = `${new Date(ev.startsAt).toLocaleTimeString(undefined, timeFmt)} – ${new Date(ev.endsAt).toLocaleTimeString(undefined, timeFmt)}`;
      return { event: ev, topMin, topPx, endMin: effectiveEndMin, heightPx, timeLabel, col: 0, cols: 1 };
    })
    .sort((a, b) => a.topMin - b.topMin || b.endMin - a.endMin);

  // Cluster transitively-overlapping blocks, then assign columns greedily
  let cluster: typeof items = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];

  const closeCluster = () => {
    for (const item of cluster) item.cols = colEnds.length;
  };

  for (const item of items) {
    if (item.topMin >= clusterEnd) {
      closeCluster();
      cluster = [];
      colEnds = [];
      clusterEnd = -1;
    }
    const free = colEnds.findIndex(colEnd => colEnd <= item.topMin);
    if (free === -1) {
      item.col = colEnds.length;
      colEnds.push(item.endMin);
    } else {
      item.col = free;
      colEnds[free] = item.endMin;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  closeCluster();

  return items;
});

// Now indicator (only when viewing today)
const nowMin = ref<number | null>(null);
let nowTimer: ReturnType<typeof setInterval> | null = null;

function updateNow() {
  const now = Date.now();
  const { start, end } = dayBounds.value;
  nowMin.value = now >= start && now < end ? minutesIntoDay(now) : null;
}

watch(() => props.dayMs, updateNow);

const scrollEl = ref<HTMLElement | null>(null);

onMounted(() => {
  updateNow();
  nowTimer = setInterval(updateNow, 60_000);

  // Scroll to 8 AM or the first timed event, whichever is earlier
  const firstMin = blocks.value.length
    ? Math.min(8 * 60, ...blocks.value.map(b => b.topMin))
    : 8 * 60;
  if (scrollEl.value) scrollEl.value.scrollTop = Math.max(0, (firstMin - 15) * PX_PER_MIN);
});

onBeforeUnmount(() => {
  if (nowTimer) clearInterval(nowTimer);
});

function hourLabel(hour: number): string {
  const d = new Date(props.dayMs);
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric' });
}

function onTrackClick(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const hour = Math.min(23, Math.max(0, Math.floor((e.clientY - rect.top) / HOUR_PX)));
  emit('slot-click', new Date(props.dayMs).setHours(hour, 0, 0, 0));
}
</script>
