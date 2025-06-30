<template>
  <div>
    <textarea
      :value="jsonString"
      @input="handleInput"
      rows="10"
      class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-800 dark:text-neutral-100 font-mono text-sm"
      :class="{ 'border-red-500': hasError }"
      placeholder='{ "type": "object", "properties": { ... } }'
    />
    <p v-if="hasError" class="mt-1 text-sm text-red-600 dark:text-red-400">
      Invalid JSON format
    </p>
    <p v-else-if="value" class="mt-1 text-sm text-green-600 dark:text-green-400">
      Valid JSON schema
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  value: any;
}>();

const emit = defineEmits<{
  update: [value: any];
}>();

const jsonString = ref('');
const hasError = ref(false);

// Initialize from props
watch(() => props.value, (newValue) => {
  if (newValue) {
    try {
      jsonString.value = JSON.stringify(newValue, null, 2);
      hasError.value = false;
    } catch {
      jsonString.value = '';
      hasError.value = true;
    }
  } else {
    jsonString.value = '';
    hasError.value = false;
  }
}, { immediate: true });

function handleInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value;
  jsonString.value = value;
  
  if (!value.trim()) {
    hasError.value = false;
    emit('update', undefined);
    return;
  }
  
  try {
    const parsed = JSON.parse(value);
    hasError.value = false;
    emit('update', parsed);
  } catch {
    hasError.value = true;
  }
}
</script> 