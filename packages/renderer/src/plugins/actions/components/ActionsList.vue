<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <p class="text-sm text-neutral-400">Manage your action functions</p>
      </div>
      <Button @click="$emit('create')" variant="primary">
        <Plus class="w-4 h-4" />
        <span>Create Action</span>
      </Button>
    </div>

    <!-- Actions Table -->
    <div class="flex-1 overflow-hidden">
      <div v-if="actions.length > 0" class="h-full overflow-y-auto custom-scrollbar">
        <table class="w-full">
          <thead class="sticky top-0 z-10 bg-neutral-900">
            <tr class="text-xs font-medium tracking-wider text-left uppercase border-b text-neutral-400 border-neutral-800">
              <th class="px-6 py-3">Name</th>
              <th class="px-6 py-3">Description</th>
              <th class="px-6 py-3">Category</th>
              <th class="px-6 py-3">Inputs</th>
              <th class="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-800">
            <tr
              v-for="action in actions"
              :key="action.id"
              class="transition-all duration-200 cursor-pointer group hover:bg-neutral-800"
              @click="$emit('select', action.id)"
            >
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex items-center justify-center w-8 h-8 transition-colors rounded-lg bg-neutral-800 group-hover:bg-neutral-700">
                    <Play class="w-4 h-4 text-neutral-400" />
                  </div>
                  <span class="font-medium text-neutral-100">{{ action.label }}</span>
                </div>
              </td>
              <td class="px-6 py-4">
                <span class="text-sm text-neutral-400 line-clamp-1" :title="action.description">
                  {{ action.description || 'No description' }}
                </span>
              </td>
              <td class="px-6 py-4">
                <span
                  class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
                  :class="action.category ? 'border' : 'text-neutral-500'"
                  :style="categoryStyle(action.category)"
                >
                  {{ getCategoryName(action.category) }}
                </span>
              </td>
              <td class="px-6 py-4">
                <div class="flex items-center gap-1.5 overflow-hidden">
                  <template v-if="Object.keys(action.input || {}).length > 0">
                    <span
                      v-for="param in Object.entries(action.input || {}).slice(0, 2)"
                      :key="param[0]"
                      class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-neutral-800/50 text-neutral-400 border border-neutral-700 whitespace-nowrap flex-shrink-0"
                      :title="param[1].description || ''"
                    >
                      {{ param[0] }}
                    </span>
                    <span
                      v-if="Object.keys(action.input || {}).length > 2"
                      class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-neutral-800/30 text-neutral-500 whitespace-nowrap flex-shrink-0"
                      :title="Object.keys(action.input || {}).slice(2).join(', ')"
                    >
                      +{{ Object.keys(action.input || {}).length - 2 }} more
                    </span>
                  </template>
                  <span v-else class="text-xs text-neutral-500">none</span>
                </div>
              </td>
              <td class="px-6 py-4">
                <div class="flex items-center justify-end gap-2">
                  <button
                    @click.stop="handleDelete(action.id)"
                    class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-red-400 hover:bg-red-400/10 active:scale-95"
                    aria-label="Delete action"
                    title="Delete action"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="flex items-center justify-center h-full">
        <div class="text-center">
          <Play class="w-12 h-12 mx-auto mb-4 text-neutral-600" />
          <h3 class="mb-2 text-lg font-medium text-neutral-300">No actions yet</h3>
          <p class="mb-4 text-sm text-neutral-500">Create your first action function to get started</p>
          <Button @click="$emit('create')" variant="primary" class="justify-self-center">
            <Plus class="w-4 h-4" />
            <span>Create Action</span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ActionEntity, EARS, Category } from '@app/api'
import { Plus, Play, Trash2 } from 'lucide-vue-next'
import Button from '@/core/components/design/button.vue'

interface Props {
  actions: ActionEntity[]
  categories: Category[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'select': [actionId: EARS.EntityId]
  'create': []
  'delete': [actionId: EARS.EntityId]
}>()

function handleDelete(actionId: EARS.EntityId) {
  if (confirm('Are you sure you want to delete this action?')) {
    emit('delete', actionId)
  }
}

// Get category name and style
function getCategoryName(categoryName?: string) {
  if (!categoryName) return 'none';
  const category = props.categories.find(c => c.name === categoryName);
  return category?.name || categoryName;
}

function categoryStyle(categoryName?: string) {
  if (!categoryName) return {}; // Return empty object for inline styles when no category
  
  const category = props.categories.find(c => c.name === categoryName);
  if (!category) {
    // Default style for unrecognized categories - neutral like input fields
    return {
      backgroundColor: 'rgb(38 38 38)', // bg-neutral-800
      color: 'rgb(245 245 245)', // text-neutral-100
      borderColor: 'rgb(64 64 64)' // border-neutral-700
    };
  }
  
  // Create inline styles using the category color
  return {
    backgroundColor: `${category.color}1A`, // 10% opacity
    color: category.color,
    borderColor: `${category.color}33` // 20% opacity
  };
}
</script>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #525252 #171717;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #171717;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #525252;
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #737373;
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>