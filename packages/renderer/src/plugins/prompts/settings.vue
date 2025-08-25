<template>
  <div class="max-w-3xl">
    <!-- Prompt Categories Section -->
    <CollapsibleSection label="Prompt Categories" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Organize your prompts into categories with custom colors for easy identification
      </p>
      <div class="space-y-4">
        <div 
          v-for="(category, index) in categories" 
          :key="index"
          class="group"
        >
          <div class="flex items-center gap-3">
            <!-- Color picker -->
            <ColorPicker
              v-model="category.color"
              @change="debouncedSave"
            />
            
            <!-- Category name input -->
            <input
              v-model="category.name"
              type="text"
              placeholder="Category name"
              class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              @input="debouncedSave"
            />
            
            <!-- Remove button -->
            <button
              @click="removeCategory(index)"
              class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
              :disabled="categories.length <= 1"
              title="Remove category"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Add category button -->
        <button
          @click="addCategory"
          class="w-full px-4 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-300 hover:text-white hover:border-neutral-600 transition-all flex items-center justify-center gap-2"
        >
          <Plus class="w-4 h-4" />
          Add Category
        </button>
      </div>
    </CollapsibleSection>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import ColorPicker from '@/core/components/design/ColorPicker.vue'
import { useDebounce } from '@/core/composables/useDebounce'
import type { PromptsSettings, Category } from '@app/api'

interface Props {
  settings?: PromptsSettings
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

// State - use settings or empty array (defaults come from backend)
const categories = ref<Category[]>(
  props.settings?.categories && props.settings.categories.length > 0
    ? [...props.settings.categories]
    : []
)

// Save function
const saveCategories = () => {
  emit('update-setting', {
    path: ['categories'],
    value: categories.value
  })
}

// Use the debounce composable for saving categories
const { debounced: debouncedSave } = useDebounce(() => {
  saveCategories()
}, 500)

// Category management
const addCategory = () => {
  const newCategory: Category = {
    name: '',
    color: '#6B7280' // Default gray color
  }
  categories.value.push(newCategory)
  saveCategories()
}

const removeCategory = (index: number) => {
  if (categories.value.length > 1) {
    categories.value.splice(index, 1)
    saveCategories()
  }
}
</script>