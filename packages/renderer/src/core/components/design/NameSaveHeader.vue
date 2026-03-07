<template>
  <div class="grid grid-cols-[minmax(auto,1fr),minmax(0,56rem),minmax(auto,1fr)] py-3 border-b border-neutral-800 items-center">
    <!-- Left: Back button + label -->
    <div class="flex items-center justify-between uppercase pl-6 pr-4">
      <button @click="$emit('back')" class="flex items-center gap-2 mr-6 px-3 py-1.5 text-sm font-medium transition-all duration-200 rounded-md bg-neutral-900/90 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100 backdrop-blur-sm shrink-0">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        <span class="hidden xl:inline">Back</span>
      </button>
      <label class="text-xs font-medium tracking-wider shrink-0 text-neutral-400">
        {{ label }}
      </label>
    </div>

    <!-- Center: consumer-provided content -->
    <div class="flex items-center gap-4 pl-0 pr-6">
      <slot />
    </div>

    <!-- Right: Action buttons -->
    <div class="flex items-center justify-end gap-2 pr-6">
      <slot name="actions" />
      <Button @click="$emit('save')" :disabled="!isValid" variant="primary" class="shrink-0">
        <span>{{ isEditing ? 'Save' : 'Create' }}</span>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from './button.vue';

withDefaults(defineProps<{
  label?: string;
  isEditing?: boolean;
  isValid?: boolean;
}>(), {
  label: 'Name',
  isEditing: false,
  isValid: true,
});

defineEmits<{
  back: [];
  save: [];
}>();
</script>
