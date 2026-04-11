<template>
  <div class="rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2">
    <div class="flex items-center gap-2">
      <span class="text-xs font-mono text-neutral-300">{{ name || 'tool' }}</span>
      <span
        :class="[
          'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
          statusBadgeClass
        ]"
      >
        {{ statusLabel }}
      </span>
      <button
        type="button"
        class="ml-auto text-[11px] text-neutral-400 hover:text-neutral-200"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Hide' : 'Details' }}
      </button>
    </div>
    <div v-if="expanded" class="mt-2 space-y-2">
      <div>
        <div class="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Input</div>
        <pre class="text-[11px] text-neutral-200 bg-neutral-900/70 rounded p-2 overflow-x-auto">{{ inputPretty }}</pre>
      </div>
      <div v-if="output !== undefined && output !== null">
        <div class="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Output</div>
        <pre class="text-[11px] text-neutral-200 bg-neutral-900/70 rounded p-2 overflow-x-auto">{{ outputPretty }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Props {
  id?: string
  name?: string
  input?: unknown
  output?: unknown
  status?: 'running' | 'done' | 'error' | string
}

const props = defineProps<Props>()

const expanded = ref(false)

const statusLabel = computed(() => {
  switch (props.status) {
    case 'running':
      return 'Running'
    case 'done':
      return 'Done'
    case 'error':
      return 'Error'
    default:
      return props.status || 'pending'
  }
})

const statusBadgeClass = computed(() => {
  switch (props.status) {
    case 'running':
      return 'bg-yellow-700/30 text-yellow-300'
    case 'done':
      return 'bg-green-700/30 text-green-300'
    case 'error':
      return 'bg-red-700/30 text-red-300'
    default:
      return 'bg-neutral-700/30 text-neutral-300'
  }
})

const inputPretty = computed(() => {
  try {
    return JSON.stringify(props.input ?? {}, null, 2)
  } catch {
    return String(props.input)
  }
})

const outputPretty = computed(() => {
  try {
    if (typeof props.output === 'string') return props.output
    return JSON.stringify(props.output, null, 2)
  } catch {
    return String(props.output)
  }
})
</script>
