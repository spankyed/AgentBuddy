<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
      <h2 class="text-lg font-semibold">
        {{ mode === 'create' ? 'Create New Prompt' : 'Edit Prompt' }}
      </h2>
      <div class="flex items-center gap-2">
        <button
          @click="$emit('cancel')"
          class="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          @click="handleSave"
          :disabled="!isValid"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ mode === 'create' ? 'Create' : 'Save' }}
        </button>
      </div>
    </div>

    <!-- Form Content -->
    <div class="flex-1 overflow-auto p-6">
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- Label -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Name <span class="text-red-500">*</span>
          </label>
          <input
            :value="formData.label"
            @input="$emit('update-label', ($event.target as HTMLInputElement).value)"
            type="text"
            class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-800 dark:text-neutral-100"
            placeholder="e.g., Summarize Text"
          />
        </div>

        <!-- Description -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Description
          </label>
          <textarea
            :value="formData.description"
            @input="$emit('update-description', ($event.target as HTMLTextAreaElement).value)"
            rows="2"
            class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-800 dark:text-neutral-100"
            placeholder="Brief description of what this prompt does..."
          />
        </div>

        <!-- Inputs/Parameters -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Input Parameters
          </label>
          <PromptInputsEditor
            :inputs="formData.inputs"
            @update="$emit('update-inputs', $event)"
          />
        </div>

        <!-- Template Function -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Template Function <span class="text-red-500">*</span>
          </label>
          <div class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            Write a JavaScript function body that returns a template string. The function will receive a `params` object with your defined inputs.
          </div>
          <div class="border border-neutral-300 dark:border-neutral-600 rounded-md overflow-hidden" style="height: 300px;">
            <PromptTemplateEditor
              :value="formData.templateFn"
              @update="$emit('update-template', $event)"
            />
          </div>
        </div>

        <!-- Output Schema (Optional) -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Output Schema (Optional)
          </label>
          <div class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            Define a JSON schema for structured output from the LLM.
          </div>
          <JsonSchemaEditor
            :value="formData.outputSchema"
            @update="$emit('update-output-schema', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TemplateInput } from '@abuddy/api';
import PromptInputsEditor from './PromptInputsEditor.vue';
import PromptTemplateEditor from './PromptTemplateEditor.vue';
import JsonSchemaEditor from './JsonSchemaEditor.vue';

const props = defineProps<{
  formData: {
    label: string;
    description?: string;
    inputs: Record<string, TemplateInput>;
    templateFn: string;
    outputSchema?: any;
  };
  mode: 'create' | 'edit';
}>();

const emit = defineEmits<{
  'update-label': [value: string];
  'update-description': [value: string];
  'update-inputs': [value: Record<string, TemplateInput>];
  'update-template': [value: string];
  'update-output-schema': [value: any];
  save: [];
  cancel: [];
}>();

const isValid = computed(() => {
  return props.formData.label.trim() !== '' && props.formData.templateFn.trim() !== '';
});

function handleSave() {
  if (isValid.value) {
    emit('save');
  }
}
</script> 