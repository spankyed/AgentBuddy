<template>
  <div class="flex items-center justify-between px-4 py-2 text-xs border-t border-gray-200 bg-gray-50 dark:bg-gray-900 dark:border-gray-700">
    <div class="flex items-center gap-4">
      <span class="text-gray-500 dark:text-gray-400">
        Line {{ cursorLine }}, Col {{ cursorCol }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-gray-500 dark:text-gray-400">JavaScript</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  cursorLine: number;
  cursorCol: number;
}>();
</script> 