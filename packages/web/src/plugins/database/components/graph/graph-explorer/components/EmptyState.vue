<template>
  <div class="absolute inset-0 flex items-center justify-center">
    <div class="text-center">
      <div class="relative inline-block">
        <Database class="w-16 h-16 mx-auto mb-4 text-neutral-400" />
        <div class="absolute inset-0 animate-ping">
          <Database class="w-16 h-16 mx-auto text-neutral-600 opacity-75" />
        </div>
      </div>
      
      <h4 class="mb-1 text-lg font-medium text-neutral-100">
        {{ title }}
      </h4>
      
      <p class="text-sm text-neutral-400">
        {{ description }}
      </p>
      
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Database } from 'lucide-vue-next';

interface Props {
  title?: string;
  description?: string;
}

withDefaults(defineProps<Props>(), {
  title: 'No Data to Display',
  description: 'Run a query to visualize the results'
});
</script> 