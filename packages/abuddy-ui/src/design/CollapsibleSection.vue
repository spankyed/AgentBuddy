<template>
  <div class="collapsible-section">
    <div class="flex items-center w-full" :class="buttonClass">
      <button
        @click="toggle"
        class="flex items-center gap-2 text-left focus:outline-none"
      >
        <ChevronRight
          class="w-4 h-4 transition-transform text-neutral-500"
          :class="{ 'rotate-90': isOpen }"
        />
        <label class="text-xs font-medium tracking-wider uppercase text-neutral-400 cursor-pointer">
          <slot name="label">{{ label }}</slot>
        </label>
      </button>
      <div v-if="isOpen && $slots['header-actions']" class="ml-auto flex items-center gap-2">
        <slot name="header-actions" />
      </div>
    </div>
    <div v-if="isOpen" class="mx-6 mt-3 mb-4">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { ChevronRight } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  label?: string;
  buttonClass?: string;
  defaultOpen?: boolean;
  modelValue?: boolean; // For v-model binding
}>(), {
  modelValue: undefined
});

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
