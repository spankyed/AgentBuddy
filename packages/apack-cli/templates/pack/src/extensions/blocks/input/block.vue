<script setup lang="ts">
defineProps<{
  label?: string;
  disabled?: boolean;
  response?: unknown;
}>();

defineEmits<{
  submit: [response: unknown];
  cancel: [];
}>();
</script>

<template>
  <div class="p-2 space-y-2">
    <p class="text-sm">{{ label ?? '__PASCAL__ Input' }}</p>
    <p v-if="disabled && response" class="text-xs text-neutral-400">{{ response }}</p>
    <div v-else class="flex gap-2">
      <button class="text-sm" :disabled="disabled" @click="$emit('submit', true)">Submit</button>
      <button class="text-sm" :disabled="disabled" @click="$emit('cancel')">Cancel</button>
    </div>
  </div>
</template>
