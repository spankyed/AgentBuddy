<template>
  <div class="grid grid-cols-[minmax(auto,1fr),minmax(0,56rem),minmax(auto,1fr)] py-3 border-b border-neutral-800 items-center">
    <!-- Left: Back button + label -->
    <div class="flex items-center justify-between uppercase pl-6 pr-4">
      <button @click="$emit('back')" class="flex items-center gap-1.5 px-2 py-1 transition-colors rounded shrink-0 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800">
        <ArrowLeft class="w-4 h-4" />
        <span class="text-xs hidden xl:inline uppercase">Back</span>
      </button>
      <label class="text-xs font-medium tracking-wider shrink-0 text-neutral-400">
        {{ label }}
      </label>
    </div>

    <!-- Center: consumer-provided content -->
    <div class="flex items-center gap-4 pl-0 pr-6">
      <slot />
    </div>

    <!-- Right: Save/Create button -->
    <div class="flex justify-end pr-6">
      <Button @click="$emit('save')" :disabled="!isValid" variant="primary" class="shrink-0">
        <span>{{ isEditing ? 'Save' : 'Create' }}</span>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
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
