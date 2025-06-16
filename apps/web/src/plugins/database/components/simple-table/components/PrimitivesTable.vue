<template>
  <div class="min-w-full">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="bg-gray-50 dark:bg-gray-800 sticky top-0">
        <tr>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Value
          </th>
        </tr>
      </thead>
      <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
        <tr
          v-for="(value, index) in values"
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
</template>

<script setup lang="ts">
interface Props {
  values: any[];
}

defineProps<Props>();
</script> 