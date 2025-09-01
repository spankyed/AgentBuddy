<template>
  <div class="collapsible-section">
    <button
      @click="toggle"
      class="flex items-center gap-2 w-full text-left focus:outline-none"
      :class="buttonClass"
    >
      <ChevronRight
        class="w-4 h-4 transition-transform text-neutral-500"
        :class="{ 'rotate-90': isOpen }"
      />
      <label class="text-xs font-medium tracking-wider uppercase text-neutral-400 cursor-pointer">
        <slot name="label">{{ label }}</slot>
      </label>
    </button>
    <div v-if="isOpen" class="mt-4">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { ChevronRight } from 'lucide-vue-next';

const props = defineProps<{
  label?: string;
  buttonClass?: string;
  defaultOpen?: boolean;
  modelValue?: boolean; // For v-model binding
}>();

const emit = defineEmits<{
  toggle: [isOpen: boolean];
  'update:modelValue': [value: boolean];
}>();

// Use internal state that can be controlled externally via modelValue
const internalIsOpen = ref(true);

// Compute the actual open state - prefer modelValue if provided, otherwise use internal state
const isOpen = computed(() => {
  return props.modelValue !== undefined ? props.modelValue : internalIsOpen.value;
});

const toggle = () => {
  if (props.modelValue !== undefined) {
    // Controlled mode - emit update event
    emit('update:modelValue', !props.modelValue);
  } else {
    // Uncontrolled mode - update internal state
    internalIsOpen.value = !internalIsOpen.value;
  }
  emit('toggle', isOpen.value);
};

// Initialize internal state on mount
onMounted(() => {
  if (props.modelValue === undefined) {
    internalIsOpen.value = props.defaultOpen ?? true;
  }
});

// Sync internal state when modelValue changes (for cases where it transitions from undefined to defined)
watch(() => props.modelValue, (newVal) => {
  if (newVal !== undefined) {
    internalIsOpen.value = newVal;
  }
});
</script>