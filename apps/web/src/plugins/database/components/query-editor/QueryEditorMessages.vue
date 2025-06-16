<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="scale-95 opacity-0"
    enter-to-class="scale-100 opacity-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="scale-100 opacity-100"
    leave-to-class="scale-95 opacity-0"
  >
    <div v-if="error || successMessage" class="flex items-center gap-2 mr-2">
      <div v-if="error" class="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
        <AlertCircle class="w-3.5 h-3.5" />
        <span>{{ error }}</span>
      </div>
      <div v-if="successMessage && !error" class="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 class="w-3.5 h-3.5" />
        <span>{{ successMessage }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { AlertCircle, CheckCircle2 } from 'lucide-vue-next';

defineProps<{
  error: string | null;
  successMessage: string;
}>();
</script> 