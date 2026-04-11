<template>
  <div class="rounded-lg border border-yellow-700/40 bg-yellow-900/10 px-3 py-3">
    <div class="flex items-center gap-2 mb-2">
      <span class="text-xs font-medium text-yellow-300">Permission requested</span>
      <span class="text-[11px] font-mono text-neutral-300">{{ toolName }}</span>
      <span
        v-if="status && status !== 'pending'"
        class="ml-auto text-[10px] uppercase tracking-wider text-neutral-400"
      >
        {{ status }}
      </span>
    </div>

    <pre
      class="text-[11px] text-neutral-200 bg-neutral-900/60 rounded p-2 overflow-x-auto max-h-32"
    >{{ inputPretty }}</pre>

    <div v-if="!isResolved" class="flex gap-2 mt-3">
      <button
        type="button"
        class="px-3 py-1.5 text-xs rounded bg-green-700/40 text-green-200 hover:bg-green-700/60"
        @click="respond('allow')"
      >
        Allow
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-xs rounded bg-green-900/40 text-green-300 hover:bg-green-900/60"
        @click="respond('allow_session')"
      >
        Allow for session
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-xs rounded bg-red-700/40 text-red-200 hover:bg-red-700/60"
        @click="respond('deny')"
      >
        Deny
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  requestId: string
  toolName: string
  input?: unknown
  status?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'respond', decision: 'allow' | 'allow_session' | 'deny'): void
}>()

const inputPretty = computed(() => {
  try {
    return JSON.stringify(props.input ?? {}, null, 2)
  } catch {
    return String(props.input)
  }
})

const isResolved = computed(() => {
  return props.status && props.status !== 'pending'
})

function respond(decision: 'allow' | 'allow_session' | 'deny') {
  emit('respond', decision)
}
</script>
