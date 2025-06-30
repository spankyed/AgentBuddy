<template>
  <div class="space-y-3">
    <!-- Existing Inputs -->
    <div 
      v-for="(input, key) in inputs" 
      :key="key"
      class="border border-neutral-300 dark:border-neutral-600 rounded-md p-4 space-y-3"
    >
      <div class="flex items-start justify-between">
        <div class="flex-1 space-y-3">
          <!-- Name -->
          <div>
            <label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              Parameter Name
            </label>
            <input
              :value="input.name"
              @input="updateInput(key, 'name', ($event.target as HTMLInputElement).value)"
              type="text"
              class="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="parameterName"
            />
          </div>

          <!-- Type -->
          <div>
            <label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              Type
            </label>
            <select
              :value="input.type"
              @change="updateInput(key, 'type', ($event.target as HTMLSelectElement).value)"
              class="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="object">object</option>
              <option value="array">array</option>
              <option value="any">any</option>
            </select>
          </div>

          <!-- Description -->
          <div>
            <label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              Description
            </label>
            <input
              :value="input.description || ''"
              @input="updateInput(key, 'description', ($event.target as HTMLInputElement).value)"
              type="text"
              class="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="Brief description..."
            />
          </div>

          <!-- Required -->
          <div class="flex items-center gap-2">
            <input
              :id="`required-${key}`"
              :checked="input.required !== false"
              @change="updateInput(key, 'required', ($event.target as HTMLInputElement).checked)"
              type="checkbox"
              class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-neutral-300 rounded"
            />
            <label :for="`required-${key}`" class="text-sm text-neutral-700 dark:text-neutral-300">
              Required
            </label>
          </div>

          <!-- Default Value -->
          <div>
            <label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              Default Value
            </label>
            <input
              :value="formatDefaultValue(input.defaultValue)"
              @input="updateDefaultValue(key, ($event.target as HTMLInputElement).value)"
              type="text"
              class="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="undefined"
            />
          </div>
        </div>

        <!-- Delete Button -->
        <button
          @click="removeInput(key)"
          class="ml-4 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Add New Input -->
    <button
      @click="addInput"
      class="w-full py-2 border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-md text-sm text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
    >
      <Plus class="w-4 h-4 inline mr-1" />
      Add Input Parameter
    </button>
  </div>
</template>

<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next';
import type { TemplateInput } from '@abuddy/api';

const props = defineProps<{
  inputs: Record<string, TemplateInput>;
}>();

const emit = defineEmits<{
  update: [value: Record<string, TemplateInput>];
}>();

function updateInput(key: string, field: keyof TemplateInput, value: any) {
  const updatedInputs = { ...props.inputs };
  updatedInputs[key] = {
    ...updatedInputs[key],
    [field]: value
  };
  emit('update', updatedInputs);
}

function updateDefaultValue(key: string, value: string) {
  try {
    // Try to parse as JSON
    const parsedValue = value ? JSON.parse(value) : undefined;
    updateInput(key, 'defaultValue', parsedValue);
  } catch {
    // If not valid JSON, store as string
    updateInput(key, 'defaultValue', value || undefined);
  }
}

function formatDefaultValue(value: any): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
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
      type: 'string' as const,
      required: true
    }
  };
  emit('update', updatedInputs);
}
</script> 