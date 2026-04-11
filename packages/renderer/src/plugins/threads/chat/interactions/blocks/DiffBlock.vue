<template>
  <div class="rounded-lg border border-neutral-700 bg-neutral-900/40 overflow-hidden">
    <div
      v-if="filePath"
      class="px-3 py-1.5 bg-neutral-800/70 text-[11px] font-mono text-neutral-300 border-b border-neutral-700"
    >
      {{ filePath }}
    </div>
    <pre class="text-[11px] p-3 overflow-x-auto whitespace-pre">
<span
  v-for="(line, idx) in lines"
  :key="idx"
  :class="lineClass(line)"
>{{ line }}
</span></pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  filePath?: string
  diff?: string
}

const props = defineProps<Props>()

const lines = computed(() => (props.diff || '').split('\n'))

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-neutral-500'
  if (line.startsWith('@@')) return 'text-blue-400'
  if (line.startsWith('+')) return 'text-green-400 bg-green-900/20 block'
  if (line.startsWith('-')) return 'text-red-400 bg-red-900/20 block'
  return 'text-neutral-300'
}
</script>
