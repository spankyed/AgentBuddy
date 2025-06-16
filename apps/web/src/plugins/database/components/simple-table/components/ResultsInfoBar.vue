<template>
  <div class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center justify-between">
      <div class="text-sm text-gray-600 dark:text-gray-400">
        <template v-if="!queryResult">
          No results
        </template>
        <template v-else-if="resultType === 'array'">
          {{ resultCount }} {{ resultCount === 1 ? 'result' : 'results' }}
        </template>
        <template v-else-if="resultType === 'object'">
          Object result
        </template>
        <template v-else-if="resultType === 'primitive'">
          Primitive value
        </template>
      </div>
      <div class="flex items-center gap-4 text-xs text-gray-500">
        <span v-if="executionTime !== null" class="text-gray-500 dark:text-gray-400">
          Executed in {{ formatExecutionTime(executionTime) }}
        </span>
        <span v-if="queryResult">
          {{ resultType }}{{ isArrayOfPrimitives ? ' (primitives)' : '' }}
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
  if (time < 1000) {
    return `${time}ms`;
  }
  return `${(time / 1000).toFixed(2)}s`;
}
</script> 