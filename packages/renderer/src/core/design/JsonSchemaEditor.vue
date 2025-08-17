<template>
  <div class="space-y-2">
    <p class="text-xs text-neutral-500">
      Define an output schema for structured output. Example: <code class="px-1 py-0.5 rounded bg-neutral-800 text-neutral-400">{{ '{ "type": "object", "properties": { ... } }' }}</code>
    </p>
    <div class="relative">
      <div 
        class="overflow-hidden border rounded-md border-neutral-700"
        :class="{ '!border-red-500': hasError }"
        style="height: 250px"
      >
        <SimpleMonacoEditor
          :model-value="jsonString"
          language="json"
          @change="handleChange"
          class="h-full"
        />
      </div>
      <div v-if="hasError || (value && !hasError)" class="absolute top-2 right-2 z-10">
        <span 
          class="inline-flex items-center px-2 py-1 text-xs font-medium rounded"
          :class="hasError ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'"
        >
          {{ hasError ? 'Invalid JSON' : 'Valid JSON' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';

const props = defineProps<{
  value: any;
}>();

const emit = defineEmits<{
  update: [value: any];
}>();

const hasError = ref(false);

const jsonString = computed(() => {
  if (props.value) {
    try {
      return JSON.stringify(props.value, null, 2);
    } catch {
      return '';
    }
  }
  return '';
});

const handleChange = (newValue: string) => {
  if (!newValue.trim()) {
    hasError.value = false;
    emit('update', undefined);
    return;
  }
  
  try {
    const parsed = JSON.parse(newValue);
    hasError.value = false;
    emit('update', parsed);
  } catch (e) {
    hasError.value = true;
    // Don't emit if invalid
  }
};

// Watch for external changes and update validation state
watch(() => props.value, () => {
  if (props.value && jsonString.value) {
    try {
      JSON.parse(jsonString.value);
      hasError.value = false;
    } catch {
      hasError.value = true;
    }
  }
});
</script> 