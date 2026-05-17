<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <!-- Frequency selector -->
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        FREQUENCY
      </label>
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
    <div v-if="frequency === 'custom'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        CRON EXPRESSION
      </label>
      <input
        :value="nodeData.cronExpression || ''"
        @input="handleRawCronChange(($event.target as HTMLInputElement).value)"
        @keydown.enter="$emit('close')"
        placeholder="* * * * *"
        class="w-full px-3 py-2 text-sm font-mono border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
      <p class="mt-1 text-[10px] text-neutral-500">
        minute hour day-of-month month day-of-week
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

type Frequency = 'every_minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

const props = defineProps<{
  node: NodeEntity
}>()

const emit = defineEmits<{
  'update-node': [updates: Record<string, any>]
  'close': []
}>()

const nodeData = computed(() => props.node as any)

const frequencyOptions: Array<{ value: Frequency; label: string }> = [
  { value: 'every_minute', label: 'Minute' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
]

// Internal visual state
const frequency = ref<Frequency>('hourly')
const minute = ref(0)
const hour = ref(9)
const dayOfWeek = ref(1) // 0=Sun, 1=Mon, ..., 6=Sat
const dayOfMonth = ref(1)

const showMinute = computed(() => ['hourly', 'daily', 'weekly', 'monthly'].includes(frequency.value))
const showHour = computed(() => ['daily', 'weekly', 'monthly'].includes(frequency.value))

/**
 * Parse a cron expression back into visual fields.
 * Returns the frequency type, or 'custom' if unparseable.
 */
function parseCron(expr: string): Frequency {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return 'custom'

  const [minP, hourP, domP, monP, dowP] = parts

  // Every minute: * * * * *
  if (minP === '*' && hourP === '*' && domP === '*' && monP === '*' && dowP === '*') {
    return 'every_minute'
  }

  const parsedMin = parseInt(minP)
  const parsedHour = parseInt(hourP)

  if (isNaN(parsedMin) || minP.includes('/') || minP.includes(',') || minP.includes('-')) return 'custom'

  // Hourly: N * * * *
  if (hourP === '*' && domP === '*' && monP === '*' && dowP === '*') {
    minute.value = parsedMin
    return 'hourly'
  }

  if (isNaN(parsedHour) || hourP.includes('/') || hourP.includes(',') || hourP.includes('-')) return 'custom'

  // Daily: N N * * *
  if (domP === '*' && monP === '*' && dowP === '*') {
    minute.value = parsedMin
    hour.value = parsedHour
    return 'daily'
  }

  // Weekly: N N * * DOW (single day only)
  if (domP === '*' && monP === '*' && dowP !== '*') {
    const parsedDow = parseInt(dowP)
    // Multi-day (commas, ranges) falls to custom
    if (isNaN(parsedDow) || dowP.includes(',') || dowP.includes('-') || dowP.includes('/')) return 'custom'
    minute.value = parsedMin
    hour.value = parsedHour
    dayOfWeek.value = parsedDow
    return 'weekly'
  }

  // Monthly: N N DOM * *
  const parsedDom = parseInt(domP)
  if (!isNaN(parsedDom) && monP === '*' && dowP === '*') {
    minute.value = parsedMin
    hour.value = parsedHour
    dayOfMonth.value = parsedDom
    return 'monthly'
  }

  return 'custom'
}

/** Build a cron expression from visual fields. */
function buildCron(): string {
  const min = String(minute.value)
  const hr = String(hour.value)

  switch (frequency.value) {
    case 'every_minute': return '* * * * *'
    case 'hourly': return `${min} * * * *`
    case 'daily': return `${min} ${hr} * * *`
    case 'weekly': return `${min} ${hr} * * ${dayOfWeek.value}`
    case 'monthly': return `${min} ${hr} ${dayOfMonth.value} * *`
    default: return nodeData.value.cronExpression || '* * * * *'
  }
}

function emitCron() {
  if (frequency.value !== 'custom') {
    emit('update-node', { cronExpression: buildCron() })
  }
}

// Initialize visual state from existing cronExpression
watch(() => nodeData.value.cronExpression, (expr) => {
  if (expr) {
    frequency.value = parseCron(expr)
  } else {
    // Persist default cron if node has none (e.g. just created)
    emitCron()
  }
}, { immediate: true })

function handleFrequencyChange(newFrequency: Frequency) {
  frequency.value = newFrequency
  if (newFrequency !== 'custom') {
    emitCron()
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

function handleDayOfWeekChange(val: number) {
  dayOfWeek.value = val
  emitCron()
}

function handleDayOfMonthChange(val: number) {
  dayOfMonth.value = val
  emitCron()
}

function handleRawCronChange(val: string) {
  emit('update-node', { cronExpression: val })
}
</script>
