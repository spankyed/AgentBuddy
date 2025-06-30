<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-neutral-800">
      <h1 class="text-2xl font-bold tracking-tight text-white">Prompts</h1>
      <button
        @click="$emit('create')"
        class="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow transition"
      >
        <Plus class="w-5 h-5" />
        <span>Create New Prompt</span>
      </button>
    </div>

    <!-- Prompts Table -->
    <div class="flex-1 p-6 overflow-auto">
      <table class="min-w-full overflow-hidden divide-y rounded-lg shadow-lg divide-neutral-800 bg-neutral-900">
        <thead class="bg-neutral-950/40">
          <tr>
            <th class="px-6 py-3 text-xs font-semibold tracking-wider text-left uppercase text-neutral-400">Name</th>
            <th class="px-6 py-3 text-xs font-semibold tracking-wider text-left uppercase text-neutral-400">Description</th>
            <th class="px-6 py-3 text-xs font-semibold tracking-wider text-left uppercase text-neutral-400">Category</th>
            <th class="px-6 py-3 text-xs font-semibold tracking-wider text-left uppercase text-neutral-400">Inputs</th>
            <th class="px-6 py-3 text-xs font-semibold tracking-wider text-left uppercase text-neutral-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="prompt in prompts"
            :key="prompt.id"
            class="transition cursor-pointer group hover:bg-neutral-800/40"
            @click="$emit('select', prompt.id)"
          >
            <td class="px-6 py-4 text-base font-medium text-white whitespace-nowrap">
              {{ prompt.label }}
            </td>
            <td class="max-w-xs px-6 py-4 text-sm truncate text-neutral-400">
              {{ prompt.description || '-' }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span
                class="inline-block px-3 py-1 text-xs font-semibold rounded-full"
                :class="categoryColor(prompt.category)"
              >
                {{ prompt.category || 'uncategorized' }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm whitespace-nowrap text-neutral-300">
              {{ Object.keys(prompt.inputs || {}).length }} inputs
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center gap-3">
                <button
                  @click.stop="$emit('edit', prompt.id)"
                  class="p-2 transition rounded-full hover:bg-blue-600/20"
                  aria-label="Edit"
                  title="Edit"
                >
                  <Edit2 class="w-5 h-5 text-blue-400" />
                </button>
                <button
                  @click.stop="confirmDelete(prompt)"
                  class="p-2 transition rounded-full hover:bg-red-600/20"
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 class="w-5 h-5 text-red-400" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div
        v-if="prompts.length === 0"
        class="flex flex-col items-center justify-center h-96 text-neutral-400"
      >
        <FileText class="w-12 h-12 mb-4" />
        <p class="text-lg font-semibold">No prompts yet</p>
        <p class="mb-4 text-sm">Create your first prompt template to get started</p>
        <button
          @click="$emit('create')"
          class="px-4 py-2 font-semibold text-white transition bg-blue-600 rounded-full shadow hover:bg-blue-700"
        >
          <Plus class="inline w-4 h-4 mr-1" /> Create New Prompt
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Edit2, Trash2, FileText } from 'lucide-vue-next';
import type { PromptEntity, EARS } from '@abuddy/api';

defineProps<{ prompts: PromptEntity[] }>();
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

// Example color coding for categories
function categoryColor(category?: string) {
  switch (category) {
    case 'text-processing':
      return 'bg-blue-900 text-blue-300';
    case 'development':
      return 'bg-green-900 text-green-300';
    case 'assistant':
      return 'bg-purple-900 text-purple-300';
    default:
      return 'bg-neutral-800 text-neutral-300';
  }
}
</script> 