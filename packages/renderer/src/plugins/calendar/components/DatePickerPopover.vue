<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        side="bottom"
        :side-offset="4"
        align="start"
        class="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden p-2"
        :class="mode === 'month' ? 'w-64' : 'w-72'"
      >
        <!-- Browse header -->
        <div class="flex items-center justify-between mb-1.5">
          <button
            class="p-1 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
            @click="browseBack"
          >
            <ChevronLeft :size="16" />
          </button>
          <span class="text-sm font-medium text-neutral-200">
            {{ mode === 'month' ? browseYear : browseMonthLabel }}
          </span>
          <button
            class="p-1 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
            @click="browseForward"
          >
            <ChevronRight :size="16" />
          </button>
        </div>

        <!-- Month select -->
        <div v-if="mode === 'month'" class="grid grid-cols-4 gap-1">
          <button
            v-for="m in 12"
            :key="m"
            class="py-2 text-xs rounded-md"
            :class="[
              browseYear === year && m - 1 === month
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-neutral-300 hover:bg-neutral-800',
              isCurrentMonth(m - 1) ? 'ring-1 ring-blue-500/50' : '',
            ]"
            @click="selectMonth(m - 1)"
          >
            {{ monthName(m - 1) }}
          </button>
        </div>

        <!-- Day select (mini month calendar) -->
        <template v-else>
          <div class="grid grid-cols-7 mb-0.5">
            <span
              v-for="wd in weekdays"
              :key="wd"
              class="text-[10px] text-neutral-500 text-center py-0.5"
            >
              {{ wd }}
            </span>
          </div>
          <div class="grid grid-cols-7 gap-0.5">
            <button
              v-for="cell in dayCells"
              :key="cell.dateMs"
              class="text-xs py-1 rounded-md"
              :class="[
                cell.isSelected
                  ? 'bg-blue-600 text-white font-semibold'
                  : cell.inMonth
                    ? 'text-neutral-300 hover:bg-neutral-800'
                    : 'text-neutral-600 hover:bg-neutral-800',
                cell.isToday && !cell.isSelected ? 'ring-1 ring-blue-500/50' : '',
              ]"
              @click="selectDay(cell.dateMs)"
            >
              {{ cell.dayOfMonth }}
            </button>
          </div>
        </template>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

const props = defineProps<{
  mode: 'month' | 'day';
  year: number;
  month: number; // 0-11
  dayMs: number;
}>();

const emit = defineEmits<{
  (e: 'select-month', year: number, month: number): void;
  (e: 'select-day', dateMs: number): void;
}>();

const open = ref(false);
const browseYear = ref(props.year);
const browseMonth = ref(props.month);

// Re-initialize browse state from props each time the popover opens
watch(open, (isOpen) => {
  if (!isOpen) return;
  if (props.mode === 'month') {
    browseYear.value = props.year;
  } else {
    const d = new Date(props.dayMs);
    browseYear.value = d.getFullYear();
    browseMonth.value = d.getMonth();
  }
});

function browseBack() {
  if (props.mode === 'month') {
    browseYear.value--;
  } else if (browseMonth.value === 0) {
    browseMonth.value = 11;
    browseYear.value--;
  } else {
    browseMonth.value--;
  }
}

function browseForward() {
  if (props.mode === 'month') {
    browseYear.value++;
  } else if (browseMonth.value === 11) {
    browseMonth.value = 0;
    browseYear.value++;
  } else {
    browseMonth.value++;
  }
}

// --- Month mode ---

function monthName(m: number): string {
  return new Date(2000, m, 1).toLocaleDateString(undefined, { month: 'short' });
}

function isCurrentMonth(m: number): boolean {
  const now = new Date();
  return browseYear.value === now.getFullYear() && m === now.getMonth();
}

function selectMonth(m: number) {
  emit('select-month', browseYear.value, m);
  open.value = false;
}

// --- Day mode ---

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const browseMonthLabel = computed(() =>
  new Date(browseYear.value, browseMonth.value, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
);

const dayCells = computed(() => {
  const first = new Date(browseYear.value, browseMonth.value, 1);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(browseYear.value, browseMonth.value, 1 - first.getDay() + i);
    const dateMs = date.getTime();
    return {
      dateMs,
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === browseMonth.value,
      isToday: dateMs === todayStart,
      isSelected: dateMs === props.dayMs,
    };
  });
});

function selectDay(dateMs: number) {
  emit('select-day', dateMs);
  open.value = false;
}
</script>
