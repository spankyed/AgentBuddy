<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <!-- Frequency selector -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs font-medium uppercase tracking-wider text-neutral-400">
          FREQUENCY
        </label>
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-neutral-500">Custom</span>
          <button
            @click="toggleCustomMode"
            :class="[
              'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
              customMode
                ? 'bg-orange-500/60'
                : 'bg-neutral-700'
            ]"
            type="button"
          >
            <span
              :class="[
                'pointer-events-none inline-block h-3 w-3 transform rounded-full bg-neutral-200 shadow transition duration-200 mt-0.5',
                customMode ? 'translate-x-3.5 ml-[-1px]' : 'translate-x-0.5'
              ]"
            />
          </button>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-1 rounded-lg border border-neutral-700 p-1">
        <button
          v-for="option in frequencyOptions"
          :key="option.value"
          @click="handleFrequencyChange(option.value)"
          :class="[
            'px-2 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
            frequency === option.value
              ? 'bg-neutral-300/20 text-neutral-300'
              : 'text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'
          ]"
          type="button"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- Second selector (every_second) -->
    <div v-if="frequency === 'every_second'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        INTERVAL (SECONDS)
      </label>
      <div class="flex gap-2">
        <select
          :value="useCustomSeconds ? 'custom' : secondInterval"
          @change="handleSecondPresetChange(($event.target as HTMLSelectElement).value)"
          class="flex-1 px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option
            v-for="n in SECOND_PRESETS"
            :key="n"
            :value="n"
          >{{ n === 1 ? 'Every second' : `Every ${n} seconds` }}</option>
          <option value="custom">Custom...</option>
        </select>
        <input
          v-if="useCustomSeconds"
          :value="secondInterval"
          @input="handleCustomSecondsInput(($event.target as HTMLInputElement).value)"
          type="number"
          min="1"
          max="59"
          placeholder="n"
          class="w-20 px-3 py-2 text-sm font-mono border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>
    </div>

    <!-- Minute selector (hourly+) -->
    <div v-if="showMinute">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        AT MINUTE
      </label>
      <select
        :value="minute"
        @change="handleMinuteChange(Number(($event.target as HTMLSelectElement).value))"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      >
        <option v-for="m in 60" :key="m - 1" :value="m - 1">
          :{{ String(m - 1).padStart(2, '0') }}
        </option>
      </select>
    </div>

    <!-- Hour selector (daily+) -->
    <div v-if="showHour">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        AT HOUR
      </label>
      <select
        :value="hour"
        @change="handleHourChange(Number(($event.target as HTMLSelectElement).value))"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      >
        <option v-for="h in 24" :key="h - 1" :value="h - 1">
          {{ String(h - 1).padStart(2, '0') }}:00
        </option>
      </select>
    </div>

    <!-- Day filter (daily) -->
    <div v-if="frequency === 'daily'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        ON DAYS
      </label>
      <div class="flex gap-1">
        <button
          v-for="day in dayOptions"
          :key="day.value"
          @click="toggleDay(day.value)"
          :class="[
            'flex-1 px-1 py-1.5 text-xs font-medium rounded-md transition-all duration-200 border',
            daysOfWeek.includes(day.value)
              ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700'
          ]"
          type="button"
        >
          {{ day.label }}
        </button>
      </div>
      <p class="mt-1 text-[10px] text-neutral-500">
        Leave empty for every day
      </p>
    </div>

    <!-- Day of week selector (weekly) -->
    <div v-if="frequency === 'weekly'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        ON DAY
      </label>
      <select
        :value="dayOfWeek"
        @change="handleDayOfWeekChange(Number(($event.target as HTMLSelectElement).value))"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      >
        <option :value="1">Monday</option>
        <option :value="2">Tuesday</option>
        <option :value="3">Wednesday</option>
        <option :value="4">Thursday</option>
        <option :value="5">Friday</option>
        <option :value="6">Saturday</option>
        <option :value="0">Sunday</option>
      </select>
    </div>

    <!-- Day of month selector (monthly) -->
    <div v-if="frequency === 'monthly'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        ON DAY
      </label>
      <select
        :value="dayOfMonth"
        @change="handleDayOfMonthChange(Number(($event.target as HTMLSelectElement).value))"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      >
        <option v-for="d in 31" :key="d" :value="d">{{ d }}</option>
      </select>
    </div>

    <!-- Raw cron input (custom mode) -->
    <div v-if="customMode">
      <input
        :value="nodeData.cronExpression || ''"
        @input="handleRawCronChange(($event.target as HTMLInputElement).value)"
        @keydown.enter="$emit('close')"
        placeholder="* * * * *"
        :class="[
          'w-full px-3 py-2 text-sm font-mono border rounded-md bg-neutral-800 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1',
          cronError
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
            : 'border-neutral-700 focus:border-orange-500 focus:ring-orange-500'
        ]"
      />
      <p v-if="cronError" class="mt-1 text-[10px] text-red-400">{{ cronError }}</p>
      <p v-else class="mt-1 text-[10px] text-neutral-500">
        [sec] min hour day month weekday
      </p>
    </div>

    <!-- Cron expression preview -->
    <div class="pt-1">
      <span class="text-[10px] text-neutral-500 font-mono">
        cron: {{ nodeData.cronExpression || '* * * * *' }}
      </span>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { NodeEntity } from '@app/api'
import BaseForm from './BaseForm.vue'
import { validateCronExpression } from '../../helpers/cron-utils'

type Frequency = 'every_second' | 'every_minute' | 'hourly' | 'daily' | 'weekly' | 'monthly'

const props = defineProps<{
  node: NodeEntity
}>()

const emit = defineEmits<{
  'update-node': [updates: Record<string, any>]
  'close': []
}>()

const nodeData = computed(() => props.node as any)

const SECOND_PRESETS = [1, 5, 10, 15, 30] as const

const frequencyOptions: Array<{ value: Frequency; label: string }> = [
  { value: 'every_second', label: 'Seconds' },
  { value: 'every_minute', label: 'Minute' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

const dayOptions = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 0, label: 'Su' },
]

// Internal visual state
const frequency = ref<Frequency>('hourly')
const minute = ref(0)
const hour = ref(9)
const daysOfWeek = ref<number[]>([]) // empty = every day (daily mode)
const selfEmitted = ref(false) // guard: skip re-parsing cron changes we triggered ourselves
const dayOfWeek = ref(1) // 0=Sun, 1=Mon, ..., 6=Sat (weekly mode)
const dayOfMonth = ref(1)
const secondInterval = ref(5) // seconds interval for every_second mode
const useCustomSeconds = ref(false) // show custom number input for seconds
const cronError = ref<string | null>(null)
const customMode = ref(false)

const showMinute = computed(() => ['hourly', 'daily', 'weekly', 'monthly'].includes(frequency.value))
const showHour = computed(() => ['daily', 'weekly', 'monthly'].includes(frequency.value))

/**
 * Parse a cron expression back into visual fields.
 * Returns the frequency type, or falls back to 'every_minute' if unparseable
 * (custom mode handles display independently).
 */
function parseCron(expr: string): Frequency {
  let parts = expr.trim().split(/\s+/)

  // 6-field: check for seconds-based patterns before stripping
  if (parts.length === 6) {
    const [secP, ...rest] = parts
    const restAllWild = rest.every(p => p === '*')

    if (secP === '*' && restAllWild) {
      secondInterval.value = 1
      useCustomSeconds.value = false
      return 'every_second'
    }
    const secStep = secP.match(/^\*\/(\d+)$/)
    if (secStep && restAllWild) {
      const n = parseInt(secStep[1])
      secondInterval.value = n
      useCustomSeconds.value = !(SECOND_PRESETS as readonly number[]).includes(n)
      return 'every_second'
    }

    // Strip seconds for standard preset detection
    parts = rest
  }

  if (parts.length !== 5) return 'every_minute'

  const [minP, hourP, domP, monP, dowP] = parts

  // Every minute: * * * * *
  if (minP === '*' && hourP === '*' && domP === '*' && monP === '*' && dowP === '*') {
    return 'every_minute'
  }

  const parsedMin = parseInt(minP)
  const parsedHour = parseInt(hourP)

  if (isNaN(parsedMin) || minP.includes('/') || minP.includes(',') || minP.includes('-')) return 'every_minute'

  // Hourly: N * * * *
  if (hourP === '*' && domP === '*' && monP === '*' && dowP === '*') {
    minute.value = parsedMin
    return 'hourly'
  }

  if (isNaN(parsedHour) || hourP.includes('/') || hourP.includes(',') || hourP.includes('-')) return 'every_minute'

  // Daily (with optional day filter): N N * * (* | DOW,DOW,...)
  if (domP === '*' && monP === '*' && dowP !== '*') {
    // Multi-day → daily with day filter
    const days = dowP.split(',').map(Number).filter(n => !isNaN(n))
    if (days.length === 0 || dowP.includes('-') || dowP.includes('/')) return 'every_minute'

    minute.value = parsedMin
    hour.value = parsedHour

    // Single day → weekly mode
    if (days.length === 1) {
      dayOfWeek.value = days[0] === 7 ? 0 : days[0]
      return 'weekly'
    }

    // Multiple days → daily with day filter (normalize 7 → 0 for Sunday)
    daysOfWeek.value = days.map(d => d === 7 ? 0 : d)
    return 'daily'
  }

  // Daily (every day): N N * * *
  if (domP === '*' && monP === '*' && dowP === '*') {
    minute.value = parsedMin
    hour.value = parsedHour
    daysOfWeek.value = []
    return 'daily'
  }

  // Monthly: N N DOM * *
  const parsedDom = parseInt(domP)
  if (!isNaN(parsedDom) && monP === '*' && dowP === '*') {
    minute.value = parsedMin
    hour.value = parsedHour
    dayOfMonth.value = parsedDom
    return 'monthly'
  }

  return 'every_minute'
}

/** Build a cron expression from visual fields. */
function buildCron(): string {
  const min = String(minute.value)
  const hr = String(hour.value)

  switch (frequency.value) {
    case 'every_second': {
      return secondInterval.value === 1
        ? '* * * * * *'
        : `*/${secondInterval.value} * * * * *`
    }
    case 'every_minute': return '* * * * *'
    case 'hourly': return `${min} * * * *`
    case 'daily': {
      const dow = daysOfWeek.value.length > 0 && daysOfWeek.value.length < 7
        ? daysOfWeek.value.sort((a, b) => a - b).join(',')
        : '*'
      return `${min} ${hr} * * ${dow}`
    }
    case 'weekly': return `${min} ${hr} * * ${dayOfWeek.value}`
    case 'monthly': return `${min} ${hr} ${dayOfMonth.value} * *`
    default: return nodeData.value.cronExpression || '* * * * *'
  }
}

function emitCron() {
  if (!customMode.value) {
    selfEmitted.value = true
    emit('update-node', { cronExpression: buildCron() })
  }
}

// Initialize visual state from existing cronExpression.
// Skip re-parsing when we triggered the change ourselves (selfEmitted guard).
watch(() => nodeData.value.cronExpression, (expr) => {
  if (selfEmitted.value) {
    selfEmitted.value = false
    return
  }
  if (expr) {
    frequency.value = parseCron(expr)
  } else {
    // Persist default cron if node has none (e.g. just created)
    emitCron()
  }
}, { immediate: true })

function handleFrequencyChange(newFrequency: Frequency) {
  frequency.value = newFrequency
  customMode.value = false
  cronError.value = null
  emitCron()
}

function toggleCustomMode() {
  customMode.value = !customMode.value
  cronError.value = null
  if (!customMode.value) {
    // Leaving custom mode: re-parse to show nearest preset UI, but don't
    // overwrite the stored cron — it may be a valid expression that doesn't
    // map to any preset (e.g. */5 * * * *, 0 9-17 * * *)
    const expr = nodeData.value.cronExpression
    if (expr) frequency.value = parseCron(expr)
  }
}

function handleMinuteChange(val: number) {
  minute.value = val
  emitCron()
}

function handleHourChange(val: number) {
  hour.value = val
  emitCron()
}

function toggleDay(day: number) {
  const idx = daysOfWeek.value.indexOf(day)
  if (idx >= 0) {
    daysOfWeek.value = daysOfWeek.value.filter(d => d !== day)
  } else {
    daysOfWeek.value = [...daysOfWeek.value, day]
  }
  emitCron()
}

function handleDayOfWeekChange(val: number) {
  dayOfWeek.value = val
  emitCron()
}

function handleDayOfMonthChange(val: number) {
  dayOfMonth.value = val
  emitCron()
}

function handleSecondPresetChange(val: string) {
  if (val === 'custom') {
    useCustomSeconds.value = true
  } else {
    useCustomSeconds.value = false
    secondInterval.value = Number(val)
    emitCron()
  }
}

function handleCustomSecondsInput(val: string) {
  const n = parseInt(val)
  if (!isNaN(n) && n >= 1 && n <= 59) {
    secondInterval.value = n
    emitCron()
  }
}

function handleRawCronChange(val: string) {
  const err = validateCronExpression(val)
  cronError.value = err
  if (!err) {
    emit('update-node', { cronExpression: val })
  }
}
</script>
