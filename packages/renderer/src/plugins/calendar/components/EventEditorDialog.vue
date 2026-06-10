<template>
  <Dialog
    :model-value="true"
    :title="mode === 'create' ? 'New Event' : 'Edit Event'"
    content-class="!max-w-[480px]"
    show-close-button
    @update:model-value="(open: boolean) => { if (!open) emit('close') }"
  >
    <form class="flex flex-col gap-4" @submit.prevent="handleSave">
      <div class="flex flex-col gap-1.5">
        <label class="text-xs text-neutral-500">Title</label>
        <input
          v-model="title"
          type="text"
          placeholder="Event title"
          class="w-full px-3 py-2 text-sm rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-200 focus:border-neutral-500 focus:outline-none"
        />
      </div>

      <label class="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
        <input v-model="allDay" type="checkbox" class="accent-blue-600" />
        All day
      </label>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-neutral-500">Start</label>
          <input
            v-model="startInput"
            :type="allDay ? 'date' : 'datetime-local'"
            class="w-full px-3 py-2 text-sm rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-200 focus:border-neutral-500 focus:outline-none [color-scheme:dark]"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-neutral-500">End</label>
          <input
            v-model="endInput"
            :type="allDay ? 'date' : 'datetime-local'"
            class="w-full px-3 py-2 text-sm rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-200 focus:border-neutral-500 focus:outline-none [color-scheme:dark]"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-xs text-neutral-500">Notes</label>
        <textarea
          v-model="notes"
          rows="3"
          placeholder="Optional notes"
          class="w-full px-3 py-2 text-sm rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-200 focus:border-neutral-500 focus:outline-none resize-none"
        />
      </div>

      <p v-if="validationError" class="text-xs text-red-400">{{ validationError }}</p>
    </form>

    <template #actions>
      <button
        v-if="mode === 'edit' && event"
        type="button"
        class="mr-auto px-3 py-1.5 text-sm rounded-md border border-red-900/60 text-red-400 hover:bg-red-950/50"
        @click="emit('delete', event.id)"
      >
        Delete
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        @click="emit('close')"
      >
        Cancel
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!canSave"
        @click="handleSave"
      >
        Save
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { CalendarEventDTO } from '@app/api';
import Dialog from '@/core/components/design/dialog.vue';

const props = defineProps<{
  mode: 'create' | 'edit';
  event: CalendarEventDTO | null;
  defaultDateMs: number | null;
}>();

const emit = defineEmits<{
  (e: 'save', payload: { eventId?: string; title: string; startsAt: number; endsAt: number; allDay: boolean; notes: string }): void;
  (e: 'delete', eventId: string): void;
  (e: 'close'): void;
}>();

const HOUR_MS = 60 * 60 * 1000;

function toLocalInput(ms: number, dateOnly: boolean): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return dateOnly ? date : `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): number {
  // 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm' both parse as local via Date constructor parts
  const [datePart, timePart] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  if (!timePart) return new Date(y, m - 1, d).getTime();
  const [h, min] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

const initialStart = props.event?.startsAt
  ?? (props.defaultDateMs != null ? props.defaultDateMs + 9 * HOUR_MS : Date.now());
const initialEnd = props.event?.endsAt ?? initialStart + HOUR_MS;
const initialAllDay = props.event?.allDay ?? false;

const title = ref(props.event?.title ?? '');
const notes = ref(props.event?.notes ?? '');
const allDay = ref(initialAllDay);
const startInput = ref(toLocalInput(initialStart, initialAllDay));
const endInput = ref(toLocalInput(initialEnd, initialAllDay));

// Reformat input values when toggling all-day (date vs datetime-local formats differ)
watch(allDay, (isAllDay) => {
  if (startInput.value) startInput.value = toLocalInput(fromLocalInput(startInput.value), isAllDay);
  if (endInput.value) endInput.value = toLocalInput(fromLocalInput(endInput.value), isAllDay);
});

const validationError = computed(() => {
  if (!startInput.value || !endInput.value) return null;
  if (fromLocalInput(endInput.value) < fromLocalInput(startInput.value)) {
    return 'End must be after start';
  }
  return null;
});

const canSave = computed(() =>
  title.value.trim().length > 0
  && !!startInput.value
  && !!endInput.value
  && !validationError.value
);

function handleSave() {
  if (!canSave.value) return;
  const startsAt = fromLocalInput(startInput.value);
  let endsAt = fromLocalInput(endInput.value);
  if (allDay.value) {
    // All-day events span to end of the end date
    endsAt = endsAt + 24 * HOUR_MS - 1;
  }
  emit('save', {
    ...(props.event ? { eventId: props.event.id } : {}),
    title: title.value.trim(),
    startsAt,
    endsAt,
    allDay: allDay.value,
    notes: notes.value,
  });
}
</script>
