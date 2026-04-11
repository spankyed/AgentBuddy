<template>
  <div class="rounded-lg border border-red-700/40 bg-red-900/10 px-3 py-2">
    <div class="text-[10px] uppercase tracking-wider text-red-400 mb-1">Error</div>
    <div class="text-[12px] whitespace-pre-wrap text-red-200">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  text?: string
}
defineProps<Props>()
</script>
