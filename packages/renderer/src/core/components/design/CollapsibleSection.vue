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
import { ref, onMounted } from 'vue';
import { ChevronRight } from 'lucide-vue-next';

const props = defineProps<{
  label?: string;
  buttonClass?: string;
  defaultOpen?: boolean;
}>();

const emit = defineEmits<{
  toggle: [isOpen: boolean];
}>();

const isOpen = ref(true);

const toggle = () => {
  isOpen.value = !isOpen.value;
  emit('toggle', isOpen.value);
};

onMounted(() => {
  isOpen.value = props.defaultOpen ?? true;
});
</script>