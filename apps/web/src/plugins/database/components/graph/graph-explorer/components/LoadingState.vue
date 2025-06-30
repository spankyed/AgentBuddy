<template>
  <div class="absolute inset-0 flex items-center justify-center bg-neutral-800/50 dark:bg-gray-800/50 backdrop-blur-sm">
    <div class="text-center">
      <div class="relative">
        <Loader2 class="w-12 h-12 mx-auto mb-4 text-blue-500 animate-spin" />
      </div>
      <h4 class="mb-1 text-lg font-medium text-neutral-100 dark:text-gray-100">
        {{ title }}
      </h4>
      <p class="text-sm text-neutral-400 dark:text-gray-400">
        {{ description }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';

interface Props {
  title?: string;
  description?: string;
}

withDefaults(defineProps<Props>(), {
  title: 'Loading Graph',
  description: 'Please wait while we prepare your visualization'
});
</script> 