<template>
  <div class="flex flex-col h-full">
    <!-- Header with Create Button -->
    <div class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
      <h2 class="text-lg font-semibold">Prompts</h2>
      <button
        @click="$emit('create')"
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        <Plus class="w-4 h-4" />
        Create New Prompt
      </button>
    </div>

    <!-- Prompts Table -->
    <div class="flex-1 overflow-auto">
      <table class="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
        <thead class="bg-neutral-50 dark:bg-neutral-800 sticky top-0">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              Name
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              Description
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              Category
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              Inputs
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-700">
          <tr
            v-for="prompt in prompts"
            :key="prompt.id"
            class="hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
            @click="$emit('select', prompt.id)"
          >
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {{ prompt.label }}
            </td>
            <td class="px-6 py-4 text-sm text-neutral-500 dark:text-neutral-400 max-w-xs truncate">
              {{ prompt.description || '-' }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
              <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                {{ prompt.category || 'uncategorized' }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
              {{ Object.keys(prompt.inputs || {}).length }} inputs
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
              <div class="flex items-center gap-2">
                <button
                  @click.stop="$emit('edit', prompt.id)"
                  class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <Edit2 class="w-4 h-4" />
                </button>
                <button
                  @click.stop="confirmDelete(prompt)"
                  class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="prompts.length === 0" class="flex flex-col items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
        <FileText class="w-12 h-12 mb-4" />
        <p class="text-lg font-medium">No prompts yet</p>
        <p class="text-sm">Create your first prompt template to get started</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Edit2, Trash2, FileText } from 'lucide-vue-next';
import type { PromptEntity, EARS } from '@abuddy/api';

defineProps<{
  prompts: PromptEntity[];
}>();

const emit = defineEmits<{
  select: [promptId: EARS.EntityId];
  create: [];
  edit: [promptId: EARS.EntityId];
  delete: [promptId: EARS.EntityId];
}>();

function confirmDelete(prompt: PromptEntity) {
  if (confirm(`Are you sure you want to delete "${prompt.label}"?`)) {
    emit('delete', prompt.id);
  }
}
</script> 