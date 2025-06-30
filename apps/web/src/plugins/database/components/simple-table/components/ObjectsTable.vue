<template>
  <div class="min-w-full">
    <table class="min-w-full divide-y divide-neutral-700">
      <thead class="sticky top-0 bg-neutral-900">
        <tr>
          <th
            v-for="header in headers"
            :key="header"
            class="px-4 py-2 text-xs font-medium tracking-wider text-left uppercase text-neutral-400"
          >
            {{ header }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y bg-neutral-950/40 divide-neutral-700">
        <tr
          v-for="(row, index) in rows"
          :key="index"
        >
          <td
            v-for="header in headers"
            :key="header"
            class="px-4 py-2 text-sm text-neutral-100"
          >
            <div class="max-w-xs truncate" :title="formatCellValue(row[header])">
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