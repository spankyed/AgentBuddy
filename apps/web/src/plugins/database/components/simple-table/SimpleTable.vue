<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Results Info Bar -->
    <div class="px-4 py-2 border-b border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
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
          <template v-else>
            {{ resultType }} result
          </template>
        </div>
        <div v-if="queryResult" class="text-xs text-gray-500">
          {{ resultType }}{{ isArrayOfPrimitives ? ' (primitives)' : '' }}
        </div>
      </div>
    </div>

    <!-- Table Container -->
    <div class="flex-1 overflow-auto">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="text-gray-500">Loading...</div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex items-center justify-center h-full p-4">
        <div class="text-center text-red-500">
          <div class="font-semibold">Query Error</div>
          <div class="mt-1 text-sm">{{ error }}</div>
        </div>
      </div>

      <!-- No Results -->
      <div v-else-if="!queryResult" class="flex items-center justify-center h-full">
        <div class="text-gray-500">Execute a query to see results</div>
      </div>

      <!-- Array of Primitives Results (Simple List) -->
      <div v-else-if="isArrayOfPrimitives && resultCount > 0" class="min-w-full">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="sticky top-0 bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-4 py-2 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                Value
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
            <tr
              v-for="(value, index) in queryResult"
              :key="index"
              class="hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <td class="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                <div class="font-mono" :title="String(value)">
                  {{ value }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Array of Objects Results (Table) -->
      <div v-else-if="resultType === 'array' && !isArrayOfPrimitives && resultCount > 0" class="min-w-full">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="sticky top-0 bg-gray-50 dark:bg-gray-800">
            <tr>
              <th
                v-for="header in tableHeaders"
                :key="header"
                class="px-4 py-2 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400"
              >
                {{ header }}
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
            <tr
              v-for="(row, index) in tableData"
              :key="index"
              class="hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <td
                v-for="header in tableHeaders"
                :key="header"
                class="px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
              >
                <div class="max-w-xs truncate" :title="formatCellValue(row[header])">
                  {{ formatCellValue(row[header]) }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty Array -->
      <div v-else-if="resultType === 'array' && resultCount === 0" class="flex items-center justify-center h-full">
        <div class="text-gray-500">Empty array returned</div>
      </div>

      <!-- Object Result -->
      <div v-else-if="resultType === 'object'" class="p-4">
        <pre class="p-4 overflow-auto text-sm bg-gray-100 rounded-md dark:bg-gray-800">{{ JSON.stringify(queryResult, null, 2) }}</pre>
      </div>

      <!-- Primitive Result -->
      <div v-else class="p-4">
        <div class="p-4 bg-gray-100 rounded-md dark:bg-gray-800">
          {{ queryResult }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSelector } from '@xstate/vue';
import { id } from '../../state';
import { applicationState } from '@/app';

// State Management
const actor = applicationState.system.get(id);
const queryResult = useSelector(actor, (state: any) => state.context.queryResult);
const isLoading = useSelector(actor, (state: any) => state.context.isLoading);
const error = useSelector(actor, (state: any) => state.context.error);

// Computed Properties
const resultType = computed(() => {
  if (!queryResult.value) return null;
  if (Array.isArray(queryResult.value)) return 'array';
  if (typeof queryResult.value === 'object') return 'object';
  return typeof queryResult.value;
});

const isArrayOfPrimitives = computed(() => {
  if (!Array.isArray(queryResult.value) || queryResult.value.length === 0) {
    return false;
  }
  // Check if first element is a primitive
  const firstElement = queryResult.value[0];
  return typeof firstElement !== 'object' || firstElement === null;
});

const resultCount = computed(() => {
  if (Array.isArray(queryResult.value)) {
    return queryResult.value.length;
  }
  return 0;
});

const tableHeaders = computed(() => {
  if (!Array.isArray(queryResult.value) || queryResult.value.length === 0 || isArrayOfPrimitives.value) {
    return [];
  }
  
  // Get all unique keys from all objects
  const allKeys = new Set<string>();
  queryResult.value.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(key => allKeys.add(key));
    }
  });
  
  // Sort keys with 'id' first, then alphabetically
  return Array.from(allKeys).sort((a, b) => {
    if (a === 'id') return -1;
    if (b === 'id') return 1;
    return a.localeCompare(b);
  });
});

const tableData = computed(() => {
  if (!Array.isArray(queryResult.value) || isArrayOfPrimitives.value) return [];
  
  // Ensure each row has all headers as keys
  return queryResult.value.map(item => {
    const row: Record<string, any> = {};
    tableHeaders.value.forEach(header => {
      row[header] = item?.[header] ?? null;
    });
    return row;
  });
});

// Helper Functions
function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
</script> 