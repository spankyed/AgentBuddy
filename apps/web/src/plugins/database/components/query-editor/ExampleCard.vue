<template>
  <div
    class="relative p-3 transition-colors rounded-lg cursor-pointer group bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
    @click="$emit('select')"
  >
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <h4 class="mb-1 text-sm font-medium text-gray-900 dark:text-gray-100">
          {{ example.title }}
        </h4>
        <p class="mb-2 text-xs text-gray-600 dark:text-gray-400">
          {{ example.description }}
        </p>
        <pre class="p-2 font-mono text-xs text-gray-700 bg-gray-100 rounded dark:text-gray-300 dark:bg-gray-900">{{ example.query }}</pre>
      </div>
      <button
        class="p-1 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600"
        title="Use this example"
      >
        <ArrowRight class="w-4 h-4 text-gray-600 dark:text-gray-400" />
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