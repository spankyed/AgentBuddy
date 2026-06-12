<template>
  <div class="flex flex-col h-full bg-neutral-900 text-neutral-300">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
      <div class="flex items-center gap-2">
        <button
          class="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
          :title="isDayView ? 'Previous day' : 'Previous month'"
          @click="actor.send({ type: isDayView ? 'CAL.PREV_DAY' : 'CAL.PREV_MONTH' })"
        >
          <ChevronLeft :size="18" />
        </button>
        <h2 class="text-lg font-semibold text-neutral-200 text-center">{{ isDayView ? dayLabel : monthLabel }}</h2>
        <button
          class="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
          :title="isDayView ? 'Next day' : 'Next month'"
          @click="actor.send({ type: isDayView ? 'CAL.NEXT_DAY' : 'CAL.NEXT_MONTH' })"
        >
          <ChevronRight :size="18" />
        </button>
        <button
          class="ml-1 px-3 py-1.5 text-sm rounded-md border border-neutral-700 hover:bg-neutral-800 text-neutral-300"
          @click="actor.send({ type: 'CAL.TODAY' })"
        >
          Today
        </button>
      </div>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-200"
        @click="actor.send({ type: 'CAL.OPEN_CREATE', dateMs: isDayView ? viewDayMs : undefined })"
      >
        <Plus :size="16" />
        New Event
      </button>
    </div>

    <!-- Day timeline -->
    <DayTimeline
      v-if="isDayView"
      class="flex-1 min-h-0"
      :day-ms="viewDayMs"
      :events="events"
      @slot-click="(dateMs: number) => actor.send({ type: 'CAL.OPEN_CREATE', dateMs, hasTime: true })"
      @event-click="(eventId: string) => actor.send({ type: 'CAL.OPEN_EDIT', eventId })"
    />

    <!-- Month grid -->
    <MonthGrid
      v-else
      class="flex-1 min-h-0"
      :year="viewYear"
      :month="viewMonth"
      :events="events"
      @day-click="(dateMs: number) => actor.send({ type: 'CAL.OPEN_CREATE', dateMs })"
      @day-number-click="(dateMs: number) => actor.send({ type: 'CAL.OPEN_DAY', dateMs })"
      @event-click="(eventId: string) => actor.send({ type: 'CAL.OPEN_EDIT', eventId })"
    />

    <!-- Editor dialog -->
    <EventEditorDialog
      v-if="editor"
      :mode="editor.mode"
      :event="editingEvent"
      :default-date-ms="editor.defaultDateMs"
      :default-has-time="editor.defaultHasTime"
      @save="(payload: SavePayload) => actor.send({
        type: 'CAL.SAVE',
        ...payload,
        eventId: editor?.mode === 'edit' ? editor.eventId ?? undefined : undefined,
      })"
      @delete="(eventId: string) => actor.send({ type: 'CAL.DELETE', eventId })"
      @close="actor.send({ type: 'CAL.CLOSE_EDITOR' })"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { applicationState } from '@/main';
import { useSelector } from '@xstate/vue';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-vue-next';
import { id, type CalendarState } from './state.ts';
import MonthGrid from './components/MonthGrid.vue';
import DayTimeline from './components/DayTimeline.vue';
import EventEditorDialog from './components/EventEditorDialog.vue';

interface SavePayload {
  title: string;
  startsAt: number;
  endsAt: number;
  allDay: boolean;
  notes: string;
}

const actor: CalendarState = applicationState.system.get(id);

const events = useSelector(actor, (state) => state.context.events);
const viewYear = useSelector(actor, (state) => state.context.viewYear);
const viewMonth = useSelector(actor, (state) => state.context.viewMonth);
const viewDayMs = useSelector(actor, (state) => state.context.viewDayMs);
const isDayView = useSelector(actor, (state) => state.matches('day'));
const editor = useSelector(actor, (state) => state.context.editor);

const editingEvent = computed(() =>
  editor.value?.eventId
    ? events.value.find(e => e.id === editor.value!.eventId) ?? null
    : null
);

const monthLabel = computed(() =>
  new Date(viewYear.value, viewMonth.value, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
);

const dayLabel = computed(() =>
  new Date(viewDayMs.value).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
);
</script>
