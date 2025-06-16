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
      <div v-if="queryResult" class="text-xs text-gray-500">
        {{ resultType }}{{ isArrayOfPrimitives ? ' (primitives)' : '' }}
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
}

defineProps<Props>();
</script> 