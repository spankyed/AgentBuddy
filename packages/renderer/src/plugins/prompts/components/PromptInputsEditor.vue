<template>
  <div class="space-y-4">
    <!-- Existing Inputs -->
    <div 
      v-for="(input, key) in inputs" 
      :key="key"
      class="p-4 border rounded-md bg-neutral-800 border-neutral-700"
    >
      <div class="flex items-start gap-4">
        <div class="flex-1 space-y-4">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <!-- Name -->
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
                Parameter Name
              </label>
              <input
                :value="input.name"
                @input="updateInput(key, 'name', ($event.target as HTMLInputElement).value)"
                type="text"
                class="w-full px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-900 border-neutral-700 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
                placeholder="parameterName"
              />
            </div>

            <!-- Type -->
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
                Type
              </label>
              <select
                :value="input.type"
                @change="updateInput(key, 'type', ($event.target as HTMLSelectElement).value)"
                class="w-full px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-900 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="object">object</option>
                <option value="array">array</option>
                <option value="any">any</option>
              </select>
            </div>
          </div>

          <!-- Description -->
          <div>
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
              Description
            </label>
            <input
              :value="input.description || ''"
              @input="updateInput(key, 'description', ($event.target as HTMLInputElement).value)"
              type="text"
              class="w-full px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-900 border-neutral-700 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
              placeholder="Brief description of this parameter..."
            />
          </div>

          <div class="flex items-center justify-between">
            <!-- Required -->
            <div class="flex items-center gap-2">
              <input
                :id="`required-${key}`"
                :checked="input.required !== false"
                @change="updateInput(key, 'required', ($event.target as HTMLInputElement).checked)"
                type="checkbox"
                class="w-4 h-4 border-2 rounded cursor-pointer bg-neutral-900 border-neutral-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-neutral-800"
              />
              <label :for="`required-${key}`" class="text-sm cursor-pointer text-neutral-300">
                Required
              </label>
            </div>

            <!-- Default Value -->
            <div class="flex-1 ml-8">
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
                Default Value
              </label>
              <input
                :value="formatDefaultValue(input.defaultValue)"
                @input="updateDefaultValue(key, ($event.target as HTMLInputElement).value)"
                type="text"
                class="w-full px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-900 border-neutral-700 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
                placeholder="undefined"
              />
            </div>
          </div>
        </div>

        <!-- Delete Button -->
        <button
          @click="removeInput(key)"
          class="p-1.5 transition-all duration-200 rounded-md text-neutral-400 hover:text-red-400 hover:bg-red-400/10 active:scale-95"
          aria-label="Remove parameter"
          title="Remove parameter"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Add New Input -->
    <button
      data-onboarding-id="prompt-inputs-add"
      @click="addInput"
      class="flex items-center justify-center w-full gap-2 px-4 py-3 text-sm font-medium transition-colors border-2 border-dashed rounded-md border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300 hover:bg-neutral-800/50"
    >
      <Plus class="w-4 h-4" />
      <span>Add Input Parameter</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next';
import type { TemplateInput } from '@app/api';

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