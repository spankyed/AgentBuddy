<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
      <h2 class="text-lg font-semibold">{{ prompt?.label }}</h2>
      <div class="flex items-center gap-2">
        <button
          @click="$emit('back')"
          class="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Back
        </button>
        <button
          @click="$emit('edit')"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Edit
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-6" v-if="prompt">
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- Basic Info -->
        <div class="bg-white dark:bg-neutral-800 rounded-lg shadow p-6 space-y-4">
          <div>
            <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Name</h3>
            <p class="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{{ prompt.label }}</p>
          </div>
          
          <div v-if="prompt.description">
            <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Description</h3>
            <p class="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{{ prompt.description }}</p>
          </div>
          
          <div v-if="prompt.category">
            <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Category</h3>
            <span class="mt-1 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
              {{ prompt.category }}
            </span>
          </div>
        </div>

        <!-- Input Parameters -->
        <div class="bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
          <h3 class="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-4">Input Parameters</h3>
          <div v-if="Object.keys(prompt.inputs || {}).length > 0" class="space-y-3">
            <div 
              v-for="(input, key) in prompt.inputs" 
              :key="key"
              class="border border-neutral-200 dark:border-neutral-700 rounded-md p-3"
            >
              <div class="flex items-start justify-between">
                <div>
                  <h4 class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {{ input.name }}
                    <span v-if="input.required !== false" class="text-red-500">*</span>
                  </h4>
                  <p v-if="input.description" class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    {{ input.description }}
                  </p>
                </div>
                <span class="text-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-2 py-1 rounded">
                  {{ input.type }}
                </span>
              </div>
              <div v-if="input.defaultValue !== undefined" class="mt-2">
                <span class="text-xs text-neutral-500 dark:text-neutral-400">Default:</span>
                <code class="text-xs bg-neutral-100 dark:bg-neutral-900 px-1 py-0.5 rounded ml-1">
                  {{ JSON.stringify(input.defaultValue) }}
                </code>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-neutral-500 dark:text-neutral-400">No input parameters defined</p>
        </div>

        <!-- Template Function -->
        <div class="bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
          <h3 class="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-4">Template Function</h3>
          <div class="border border-neutral-300 dark:border-neutral-600 rounded-md overflow-hidden" style="height: 300px;">
            <PromptTemplateViewer :value="prompt.templateFn" />
          </div>
        </div>

        <!-- Output Schema -->
        <div v-if="prompt.outputSchema" class="bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
          <h3 class="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-4">Output Schema</h3>
          <pre class="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-md overflow-auto text-sm">{{ JSON.stringify(prompt.outputSchema, null, 2) }}</pre>
        </div>

        <!-- Metadata -->
        <div class="bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
          <h3 class="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-4">Metadata</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-neutral-500 dark:text-neutral-400">Created:</span>
              <span class="ml-2 text-neutral-900 dark:text-neutral-100">
                {{ new Date(prompt.createdAt).toLocaleString() }}
              </span>
            </div>
            <div v-if="prompt.updatedAt">
              <span class="text-neutral-500 dark:text-neutral-400">Updated:</span>
              <span class="ml-2 text-neutral-900 dark:text-neutral-100">
                {{ new Date(prompt.updatedAt).toLocaleString() }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PromptEntity } from '@abuddy/api';
import PromptTemplateViewer from './PromptTemplateViewer.vue';

defineProps<{
  prompt?: PromptEntity;
}>();

defineEmits<{
  edit: [];
  back: [];
}>();
</script> 