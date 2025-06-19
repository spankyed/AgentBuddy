<template>
  <div v-if="state === 'loading'" class="flex items-center justify-center h-full">
    <div class="text-neutral-500">Loading...</div>
  </div>

  <div v-else-if="state === 'error'" class="flex items-center justify-center h-full p-4">
    <div class="text-center text-red-500">
      <div class="font-semibold">Query Error</div>
      <div class="mt-1 text-sm">{{ error }}</div>
    </div>
  </div>

  <div v-else-if="state === 'no-results'" class="flex items-center justify-center h-full">
    <div class="text-center">
      <div class="relative inline-block">
        <Database class="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <!-- <div class="absolute inset-0 animate-ping">
          <Database class="w-16 h-16 mx-auto text-gray-200 opacity-75 dark:text-gray-700" />
        </div> -->
      </div>
      
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Execute a query to see the results
      </p>
    </div>
  </div>

  <div v-else-if="state === 'empty-array'" class="flex items-center justify-center h-full">
    <div class="text-neutral-500">Empty array returned</div>
  </div>
</template>

<script setup lang="ts">
import { Database } from 'lucide-vue-next';

interface Props {
  state: 'loading' | 'error' | 'no-results' | 'empty-array';
  error?: string;
}

defineProps<Props>();
</script> 