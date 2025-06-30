<template>
  <div
    class="relative p-3 transition-colors rounded-lg cursor-pointer group bg-neutral-900 dark:bg-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-700"
    @click="$emit('select')"
  >
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <h4 class="mb-1 text-sm font-medium text-neutral-100 dark:text-neutral-100">
          {{ example.title }}
        </h4>
        <p class="mb-2 text-xs text-neutral-400 dark:text-neutral-400">
          {{ example.description }}
        </p>
        <pre class="p-2 font-mono text-xs rounded text-neutral-300 bg-neutral-800 dark:text-neutral-300 dark:bg-neutral-800">{{ example.query }}</pre>
      </div>
      <button
        class="p-1 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-600 dark:hover:bg-neutral-600"
        title="Use this example"
      >
        <ArrowRight class="w-4 h-4 text-neutral-400 dark:text-neutral-400" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
import type { QueryExample } from './query-examples';

defineProps<{
  example: QueryExample;
}>();

defineEmits<{
  select: [];
}>();
</script> 