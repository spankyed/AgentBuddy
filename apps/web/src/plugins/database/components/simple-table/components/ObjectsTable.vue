<template>
  <div class="min-w-full">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="bg-gray-50 dark:bg-gray-800 sticky top-0">
        <tr>
          <th
            v-for="header in headers"
            :key="header"
            class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
          >
            {{ header }}
          </th>
        </tr>
      </thead>
      <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
        <tr
          v-for="(row, index) in rows"
          :key="index"
          class="hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <td
            v-for="header in headers"
            :key="header"
            class="px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <div class="truncate max-w-xs" :title="formatCellValue(row[header])">
              {{ formatCellValue(row[header]) }}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
interface Props {
  headers: string[];
  rows: Record<string, any>[];
}

defineProps<Props>();

function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
</script> 