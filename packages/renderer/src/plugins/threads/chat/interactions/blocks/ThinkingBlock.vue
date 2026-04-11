<template>
  <details class="rounded-lg border border-neutral-700 bg-neutral-800/30 px-3 py-2">
    <summary class="text-xs text-neutral-400 cursor-pointer select-none">
      Thinking…
    </summary>
    <div class="mt-2 text-[11px] whitespace-pre-wrap text-neutral-300">
      {{ text }}
    </div>
  </details>
</template>

<script setup lang="ts">
interface Props {
  text?: string
}
defineProps<Props>()
</script>
