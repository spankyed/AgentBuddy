<template>
  <div class="space-y-2">
    <!-- Existing Inputs -->
    <ParameterRow
      v-for="(input, key) in inputs"
      :key="key"
      :param-key="input.name"
      :type="input.type"
      :required="input.required === true"
      :description="input.description"
      :expanded="expandedInputs.has(key as string)"
      @update:key="updateInput(key, 'name', $event)"
      @update:type="updateInput(key, 'type', $event)"
      @update:required="updateInput(key, 'required', $event)"
      @update:description="updateInput(key, 'description', $event)"
      @update:expanded="toggleExpanded(key as string)"
      @remove="removeInput(key as string)"
    />

    <!-- Add New Input -->
    <button
      data-onboarding-id="prompt-inputs-add"
      @click="addInput"
      class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-2 border-dashed rounded-md border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
    >
      <Plus class="w-4 h-4" />
      Add Parameter
    </button>
  </div>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import { ref } from 'vue';
import type { TemplateInput } from '@app/api';
import ParameterRow from '@/core/components/design/ParameterRow.vue';

const props = defineProps<{
  inputs: Record<string, TemplateInput>;
}>();

const emit = defineEmits<{
  update: [value: Record<string, TemplateInput>];
}>();

// Track which inputs are expanded
const expandedInputs = ref<Set<string>>(new Set());

function toggleExpanded(key: string) {
  if (expandedInputs.value.has(key)) {
    expandedInputs.value.delete(key);
  } else {
    expandedInputs.value.add(key);
  }
}

function updateInput(key: string, field: keyof TemplateInput, value: any) {
  const updatedInputs = { ...props.inputs };
  updatedInputs[key] = {
    ...updatedInputs[key],
    [field]: value
  };
  emit('update', updatedInputs);
}

function removeInput(key: string) {
  const updatedInputs = { ...props.inputs };
  delete updatedInputs[key];
  emit('update', updatedInputs);
}

function addInput() {
  const newKey = `param${Object.keys(props.inputs).length + 1}`;
  const updatedInputs = {
    ...props.inputs,
    [newKey]: {
      name: newKey,
      type: 'any' as const,
      required: false
    }
  };
  emit('update', updatedInputs);
}
</script> 