<template>
  <div class="flex items-center justify-between px-4 py-2 text-xs border-t border-neutral-200 bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-700">
    <div class="flex items-center gap-4">
      <span class="text-neutral-500 dark:text-neutral-400">
        Line {{ cursorLine }}, Col {{ cursorCol }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-neutral-500 dark:text-neutral-400">JavaScript</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  cursorLine: number;
  cursorCol: number;
}>();
</script> 