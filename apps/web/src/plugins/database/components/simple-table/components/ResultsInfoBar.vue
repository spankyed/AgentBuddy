<template>
  <div class="border-t bg-neutral-800 dark:bg-neutral-900 border-neutral-800 dark:border-neutral-800">
    <div class="flex items-center justify-between px-4 py-3">
      <!-- Left side - Primary information -->
      <div class="flex items-center gap-4 text-sm">
        <!-- Result count with small icon -->
        <div class="flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <template v-if="!queryResult">
            <span class="text-neutral-500 dark:text-neutral-400">No results</span>
          </template>
          <template v-else-if="resultType === 'array'">
            <span class="font-semibold text-neutral-100 dark:text-neutral-100">{{ resultCount.toLocaleString() }}</span>
            <span class="text-neutral-500 dark:text-neutral-400">{{ resultCount === 1 ? 'result' : 'results' }}</span>
          </template>
          <template v-else-if="resultType === 'object'">
            <span class="text-neutral-300 dark:text-neutral-300">Object result</span>
          </template>
          <template v-else-if="resultType === 'primitive'">
            <span class="text-neutral-300 dark:text-neutral-300">Primitive value</span>
          </template>
        </div>

        <!-- Data type indicator - more subtle -->
        <div v-if="queryResult" class="flex items-center text-xs text-neutral-500 dark:text-neutral-400">
          <svg class="w-3 h-3 mr-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          {{ resultType }}{{ isArrayOfPrimitives ? ' (primitives)' : '' }}
        </div>
      </div>

      <!-- Right side - Performance metric -->
      <div v-if="executionTime !== null" class="flex items-center gap-1.5 text-sm">
        <svg class="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="font-medium" :class="getExecutionTimeClass(executionTime)">
          {{ formatExecutionTime(executionTime) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ResultType } from '../composables/useResultAnalysis';

interface Props {
  queryResult: any;
  resultType: ResultType;
  resultCount: number;
  isArrayOfPrimitives: boolean;
  executionTime: number | null;
}

defineProps<Props>();

function formatExecutionTime(time: number): string {
  if (time < 1) {
    return `${time.toFixed(3)}ms`;
  } else if (time < 1000) {
    return `${time.toFixed(2)}ms`;
  }
  return `${(time / 1000).toFixed(3)}s`;
}

function getExecutionTimeClass(time: number): string {
  if (time < 100) {
    return 'text-green-600 dark:text-green-400'; // Fast
  } else if (time < 1000) {
    return 'text-yellow-600 dark:text-yellow-400'; // Medium
  }
  return 'text-red-600 dark:text-red-400'; // Slow
}
</script> 